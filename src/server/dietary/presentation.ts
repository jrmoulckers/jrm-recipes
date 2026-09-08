import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  dietaryIngredientInputSchema,
  dietaryLinkedFoodInputSchema,
  dietaryAssessmentSourceSchema,
  dietaryConfidenceSchema,
  dietaryEvidenceFindingSchema,
  dietaryVerdictSchema,
  type DietaryIngredientInput,
} from '~/lib/dietary-assessment';
import { dietaryIngredientFingerprint } from '~/lib/dietary-fingerprint';
import {
  type CardDietaryData,
  type DietaryAssessmentView,
  type DietaryAttentionView,
} from '~/lib/dietary-presentation';
import { dietaryRuleIdsForTag } from '~/lib/dietary-projection';
import { dietaryRulesetVersion } from '~/lib/dietary-rules';
import { isDietaryTag } from '~/lib/substitutions';
import { db, isDbConfigured } from '~/server/db';
import { dietaryAssessments, foodItems, recipeIngredients, recipes } from '~/server/db/schema';
import { listDietaryAssessmentsForViewer } from './assessments';

export function authorConfirmedDietaryAssessmentViews(
  dietaryFlags: readonly string[] | null | undefined,
  totalIngredients: number,
): DietaryAssessmentView[] {
  const ruleIds = (dietaryFlags ?? [])
    .filter(isDietaryTag)
    .flatMap(dietaryRuleIdsForTag)
    .filter((ruleId, index, values) => values.indexOf(ruleId) === index);
  return ruleIds.map((ruleId) => ({
    ruleId,
    source: 'author-confirmed',
    verdict: 'meets',
    confidence: null,
    recognizedIngredients: totalIngredients,
    totalIngredients,
    attentionIngredients: [],
  }));
}

/**
 * Attach current canonical assessment facts to a page of recipe cards in two
 * batched reads. Author declarations remain their ADR-approved compatibility
 * source, but are projected into the same view model and stay subject to a
 * deterministic conflict in downstream precedence.
 */
export async function attachCardDietaryData<
  T extends { id: string; dietaryFlags?: readonly string[] | null },
>(rows: T[]): Promise<(T & { dietary: CardDietaryData })[]> {
  if (rows.length === 0) return [];
  if (!isDbConfigured()) {
    return rows.map((row) => ({
      ...row,
      dietary: {
        assessments: authorConfirmedDietaryAssessmentViews(row.dietaryFlags, 0),
        ingredients: [],
      },
    }));
  }

  const recipeIds = [...new Set(rows.map((row) => row.id))];
  const { ingredientRows, assessmentRows, declarationRows } = await db.transaction(
    async (tx) => {
      const [ingredientRows, assessmentRows, declarationRows] = await Promise.all([
        tx
          .select({
            id: recipeIngredients.id,
            recipeId: recipeIngredients.recipeId,
            name: recipeIngredients.item,
            amount: recipeIngredients.quantity,
            amountMax: recipeIngredients.quantityMax,
            unit: recipeIngredients.unit,
            prep: recipeIngredients.prep,
            foodId: foodItems.id,
            foodSlug: foodItems.slug,
            foodCategory: foodItems.category,
            foodAllergens: foodItems.allergens,
          })
          .from(recipeIngredients)
          .leftJoin(foodItems, eq(recipeIngredients.foodId, foodItems.id))
          .where(inArray(recipeIngredients.recipeId, recipeIds)),
        tx.query.dietaryAssessments.findMany({
          where: and(
            inArray(dietaryAssessments.recipeId, recipeIds),
            eq(dietaryAssessments.scope, 'canonical'),
            eq(dietaryAssessments.rulesetVersion, dietaryRulesetVersion()),
            isNull(dietaryAssessments.invalidatedAt),
          ),
          with: { evidence: true },
        }),
        tx.query.recipes.findMany({
          where: inArray(recipes.id, recipeIds),
          columns: { id: true, dietaryFlags: true },
        }),
      ]);
      return { ingredientRows, assessmentRows, declarationRows };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );

  const ingredientsByRecipe = new Map<string, { id: string; name: string }[]>();
  const dietaryInputsByRecipe = new Map<string, DietaryIngredientInput[]>();
  const ingredientRecipe = new Map<string, string>();
  const ingredientName = new Map<string, string>();
  for (const ingredient of ingredientRows) {
    const list = ingredientsByRecipe.get(ingredient.recipeId) ?? [];
    list.push({ id: ingredient.id, name: ingredient.name });
    ingredientsByRecipe.set(ingredient.recipeId, list);
    ingredientRecipe.set(ingredient.id, ingredient.recipeId);
    ingredientName.set(ingredient.id, ingredient.name);

    const linkedFood = dietaryLinkedFoodInputSchema.safeParse(
      ingredient.foodId && ingredient.foodSlug && ingredient.foodCategory
        ? {
            id: ingredient.foodId,
            slug: ingredient.foodSlug,
            category: ingredient.foodCategory,
            allergens: ingredient.foodAllergens,
          }
        : null,
    );
    const inputs = dietaryInputsByRecipe.get(ingredient.recipeId) ?? [];
    inputs.push(
      dietaryIngredientInputSchema.parse({
        ingredientId: ingredient.id,
        item: ingredient.name,
        amount: ingredient.amount,
        amountMax: ingredient.amountMax,
        unit: ingredient.unit,
        prep: ingredient.prep,
        linkedFood: linkedFood.success ? linkedFood.data : null,
      }),
    );
    dietaryInputsByRecipe.set(ingredient.recipeId, inputs);
  }
  const ingredientFingerprintByRecipe = new Map(
    recipeIds.map((recipeId) => [
      recipeId,
      dietaryIngredientFingerprint(dietaryInputsByRecipe.get(recipeId) ?? []),
    ]),
  );

  const assessmentsByRecipe = new Map<string, DietaryAssessmentView[]>();
  for (const row of assessmentRows) {
    if (!row.ruleId) continue;
    if (row.ingredientFingerprint !== ingredientFingerprintByRecipe.get(row.recipeId)) continue;
    const ingredients = ingredientsByRecipe.get(row.recipeId) ?? [];
    const evidenceByIngredient = new Map<string, typeof row.evidence>();
    for (const evidence of row.evidence) {
      const entries = evidenceByIngredient.get(evidence.ingredientId) ?? [];
      entries.push(evidence);
      evidenceByIngredient.set(evidence.ingredientId, entries);
    }
    const effectiveEvidence = [...evidenceByIngredient.values()].flatMap((entries) => {
      const corrections = entries.filter((evidence) => evidence.source === 'ingredient-correction');
      return corrections.length > 0 ? corrections : entries;
    });
    const recognizedIds = new Set(
      effectiveEvidence
        .filter((evidence) => evidence.finding === 'present' || evidence.finding === 'absent')
        .map((evidence) => evidence.ingredientId),
    );
    const attentionByIngredient = new Map<string, DietaryAttentionView>();
    for (const evidence of effectiveEvidence) {
      const finding = dietaryEvidenceFindingSchema.parse(evidence.finding);
      if (finding !== 'present' && finding !== 'possible' && finding !== 'unresolved') continue;
      if (ingredientRecipe.get(evidence.ingredientId) !== row.recipeId) continue;
      const kind = finding === 'present' ? 'conflict' : 'unresolved';
      const existing = attentionByIngredient.get(evidence.ingredientId);
      if (!existing || kind === 'conflict') {
        attentionByIngredient.set(evidence.ingredientId, {
          ingredientId: evidence.ingredientId,
          name: ingredientName.get(evidence.ingredientId) ?? '',
          kind,
        });
      }
    }
    const list = assessmentsByRecipe.get(row.recipeId) ?? [];
    list.push({
      ruleId: row.ruleId,
      source: dietaryAssessmentSourceSchema.parse(row.source),
      verdict: dietaryVerdictSchema.parse(row.verdict),
      confidence: dietaryConfidenceSchema.nullable().parse(row.confidence),
      recognizedIngredients: recognizedIds.size,
      totalIngredients: ingredients.length,
      attentionIngredients: [...attentionByIngredient.values()],
    });
    assessmentsByRecipe.set(row.recipeId, list);
  }
  const declarationsByRecipe = new Map(
    declarationRows.map((row) => [row.id, row.dietaryFlags] as const),
  );

  return rows.map((row) => {
    const ingredients = ingredientsByRecipe.get(row.id) ?? [];
    const persisted = assessmentsByRecipe.get(row.id) ?? [];
    const persistedConfirmed = new Set(
      persisted
        .filter((assessment) => assessment.source === 'author-confirmed')
        .map((assessment) => assessment.ruleId),
    );
    const declarations = authorConfirmedDietaryAssessmentViews(
      declarationsByRecipe.get(row.id),
      ingredients.length,
    ).filter((assessment) => !persistedConfirmed.has(assessment.ruleId));
    return {
      ...row,
      dietary: {
        ingredients,
        assessments: [...persisted, ...declarations],
      },
    };
  });
}

function assessmentPriority(assessment: DietaryAssessmentView): number {
  if (assessment.verdict === 'conflicts') return 0;
  if (assessment.verdict === 'unknown') return 1;
  if (assessment.confidence === 'medium') return 2;
  if (assessment.source === 'author-confirmed') return 3;
  return 4;
}

function selectEffectiveRow<T extends { source: string; verdict: string }>(
  rows: readonly T[],
): T | null {
  return (
    rows.find((row) => row.source === 'deterministic' && row.verdict === 'conflicts') ??
    rows.find((row) => row.verdict === 'conflicts') ??
    rows.find((row) => row.source === 'author-confirmed') ??
    rows.find((row) => row.source === 'deterministic') ??
    rows.find((row) => row.source === 'on-device') ??
    null
  );
}

function selectEffectiveViews(assessments: readonly DietaryAssessmentView[]) {
  const byRule = new Map<string, DietaryAssessmentView[]>();
  for (const assessment of assessments) {
    const rows = byRule.get(assessment.ruleId) ?? [];
    rows.push(assessment);
    byRule.set(assessment.ruleId, rows);
  }
  return [...byRule.values()]
    .flatMap((rows) => {
      const effective = selectEffectiveRow(rows);
      return effective ? [effective] : [];
    })
    .sort((a, b) => assessmentPriority(a) - assessmentPriority(b));
}

/**
 * The caller has already authorized access to the complete recipe (for
 * example, through an unlisted share token). This keeps share-token detail
 * pages on canonical assessment precedence without widening the public data
 * access contract.
 */
export async function listAuthorizedRecipeDietaryAssessmentViews(
  recipeId: string,
): Promise<DietaryAssessmentView[]> {
  const [recipe] = await attachCardDietaryData([{ id: recipeId }]);
  return selectEffectiveViews(recipe?.dietary.assessments ?? []);
}

/** Canonical rule badges for a recipe detail page, ordered by attention first. */
export async function listRecipeDietaryAssessmentViews(
  recipeId: string,
  actorId: string,
): Promise<DietaryAssessmentView[]> {
  if (!isDbConfigured()) return [];
  await listDietaryAssessmentsForViewer(recipeId, actorId);
  const [recipe] = await attachCardDietaryData([{ id: recipeId }]);
  return selectEffectiveViews(recipe?.dietary.assessments ?? []);
}
