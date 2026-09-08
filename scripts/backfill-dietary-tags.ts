/**
 * Backfill deterministic dietary assessments and their conservative
 * `recipes.dietary_tags` compatibility projection (ADR-0011, #1101).
 *
 * The previous backfill inferred "-free" tags from the absence of a text match.
 * This replacement persists ingredient evidence first and projects a positive
 * tag only when every ingredient has complete relevant coverage.
 */
import { createId } from '@paralleldrive/cuid2';
import postgres from 'postgres';

import {
  dietaryIngredientEvidenceSchema,
  dietaryIngredientInputSchema,
  dietaryLinkedFoodInputSchema,
} from '../src/lib/dietary-assessment';
import {
  aggregateDietaryEvidence,
  assessIngredientsDeterministically,
} from '../src/lib/dietary-evidence';
import { dietaryIngredientFingerprint } from '../src/lib/dietary-fingerprint';
import {
  legacyDietaryRuleIdForTag,
  projectLegacyDietaryTags,
  type DietaryAssessmentProjectionInput,
} from '../src/lib/dietary-projection';
import {
  BUILT_IN_DIETARY_RULES,
  DIETARY_ALGORITHM_VERSION,
  dietaryRulesetVersion,
} from '../src/lib/dietary-rules';

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.log('[backfill-dietary] No database URL set, nothing to do.');
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

type RecipeRow = { id: string };
type IngredientRow = {
  id: string;
  recipe_id: string;
  item: string;
  quantity: number | null;
  quantity_max: number | null;
  unit: string | null;
  prep: string | null;
  food_id: string | null;
  food_slug: string | null;
  food_category: string | null;
  food_allergens: string[] | null;
};
type CorrectionRow = {
  id: string;
  ingredient_id: string;
  rule_id: string;
  finding: 'present' | 'absent' | 'possible' | 'unresolved';
  corrected_food_id: string | null;
};

async function main() {
  const recipes = await sql<RecipeRow[]>`
    SELECT id FROM recipes WHERE deleted_at IS NULL ORDER BY id
  `;
  const ingredientRows = await sql<IngredientRow[]>`
    SELECT
      i.id,
      i.recipe_id,
      i.item,
      i.quantity,
      i.quantity_max,
      i.unit,
      i.prep,
      f.id AS food_id,
      f.slug AS food_slug,
      f.category AS food_category,
      f.allergens AS food_allergens
    FROM recipe_ingredients i
    LEFT JOIN food_items f ON f.id = i.food_id
    ORDER BY i.recipe_id, i.position
  `;
  const correctionRows = await sql<CorrectionRow[]>`
    SELECT id, ingredient_id, rule_id, finding, corrected_food_id
    FROM dietary_ingredient_corrections
    WHERE revoked_at IS NULL
      AND rule_id IS NOT NULL
  `;
  const correctionsByIngredient = new Map<string, CorrectionRow[]>();
  for (const correction of correctionRows) {
    const rows = correctionsByIngredient.get(correction.ingredient_id) ?? [];
    rows.push(correction);
    correctionsByIngredient.set(correction.ingredient_id, rows);
  }
  const byRecipe = new Map<string, IngredientRow[]>();
  for (const ingredient of ingredientRows) {
    const rows = byRecipe.get(ingredient.recipe_id) ?? [];
    rows.push(ingredient);
    byRecipe.set(ingredient.recipe_id, rows);
  }

  const rulesetVersion = dietaryRulesetVersion();
  let processed = 0;
  for (const recipe of recipes) {
    const ingredients = (byRecipe.get(recipe.id) ?? []).map((row) => {
      const linkedFood = dietaryLinkedFoodInputSchema.safeParse(
        row.food_id && row.food_slug && row.food_category
          ? {
              id: row.food_id,
              slug: row.food_slug,
              category: row.food_category,
              allergens: row.food_allergens,
            }
          : null,
      );
      return dietaryIngredientInputSchema.parse({
        ingredientId: row.id,
        item: row.item,
        amount: row.quantity,
        amountMax: row.quantity_max,
        unit: row.unit,
        prep: row.prep,
        linkedFood: linkedFood.success ? linkedFood.data : null,
      });
    });
    const ingredientFingerprint = dietaryIngredientFingerprint(ingredients);
    const projections: DietaryAssessmentProjectionInput[] = [];

    await sql.begin(async (tx) => {
      await tx`
        UPDATE dietary_assessments
        SET invalidated_at = now(), updated_at = now()
        WHERE recipe_id = ${recipe.id}
          AND scope = 'canonical'
          AND source = 'deterministic'
          AND invalidated_at IS NULL
      `;

      for (const rule of BUILT_IN_DIETARY_RULES) {
        const deterministic = assessIngredientsDeterministically(ingredients, rule.id);
        const corrections = ingredients.flatMap((ingredient) =>
          (correctionsByIngredient.get(ingredient.ingredientId) ?? [])
            .filter((correction) => correction.rule_id === rule.id)
            .map((correction) =>
              dietaryIngredientEvidenceSchema.parse({
                ingredientId: correction.ingredient_id,
                ruleId: correction.rule_id,
                finding: correction.finding,
                source: 'ingredient-correction',
                material: true,
                foodId: correction.corrected_food_id,
                correctionId: correction.id,
              }),
            ),
        );
        const assessment =
          corrections.length === 0
            ? deterministic
            : {
                ...deterministic,
                ...aggregateDietaryEvidence({
                  ruleId: rule.id,
                  ingredientIds: ingredients.map((ingredient) => ingredient.ingredientId),
                  evidence: [...deterministic.evidence, ...corrections],
                }),
              };
        const assessmentId = createId();
        await tx`
          INSERT INTO dietary_assessments (
            id, recipe_id, rule_id, scope, source, verdict, confidence,
            ingredient_fingerprint, analyzer_version, ruleset_version
          ) VALUES (
            ${assessmentId}, ${recipe.id}, ${rule.id}, 'canonical', 'deterministic',
            ${assessment.verdict}, ${assessment.confidence}, ${ingredientFingerprint},
            ${`deterministic-${DIETARY_ALGORITHM_VERSION}`}, ${rulesetVersion}
          )
        `;
        for (const evidence of assessment.evidence) {
          await tx`
            INSERT INTO dietary_evidence (
              id, assessment_id, ingredient_id, finding, source, material,
              food_id, correction_id
            ) VALUES (
              ${createId()}, ${assessmentId}, ${evidence.ingredientId},
              ${evidence.finding}, ${evidence.source}, ${evidence.material},
              ${evidence.foodId}, ${evidence.correctionId}
            )
          `;
        }
        projections.push({
          ruleId: rule.id,
          customRestrictionId: null,
          scope: 'canonical',
          source: 'deterministic',
          verdict: assessment.verdict,
          confidence: assessment.confidence,
          invalidatedAt: null,
        });
      }

      const canonicalConflicts = await tx<{ rule_id: string }[]>`
        SELECT rule_id
        FROM dietary_assessments
        WHERE recipe_id = ${recipe.id}
          AND scope = 'canonical'
          AND verdict = 'conflicts'
          AND ingredient_fingerprint = ${ingredientFingerprint}
          AND ruleset_version = ${rulesetVersion}
          AND invalidated_at IS NULL
      `;
      const conflictingRuleIds = new Set(canonicalConflicts.map((row) => row.rule_id));
      const tags = projectLegacyDietaryTags(projections).filter(
        (tag) => !conflictingRuleIds.has(legacyDietaryRuleIdForTag(tag)!),
      );
      await tx`
        UPDATE recipes
        SET dietary_tags = ${tags.length > 0 ? tags : null}
        WHERE id = ${recipe.id}
      `;
      await tx`
        DELETE FROM dietary_assessments
        WHERE recipe_id = ${recipe.id}
          AND scope = 'canonical'
          AND source = 'deterministic'
          AND invalidated_at IS NOT NULL
      `;
    });
    processed++;
  }

  console.log(`[backfill-dietary] Backfilled ${processed} recipe(s).`);
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('[backfill-dietary] Failed:', error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
