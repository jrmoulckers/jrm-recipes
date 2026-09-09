import 'server-only';

import { inArray } from 'drizzle-orm';

import {
  dietaryAssessmentScopeSchema,
  dietaryAssessmentSourceSchema,
  dietaryConfidenceSchema,
  dietaryEvidenceFindingSchema,
  dietaryVerdictSchema,
} from '~/lib/dietary-assessment';
import {
  type CardDietaryData,
  type DietaryAssessmentView,
  type DietaryAttentionView,
} from '~/lib/dietary-presentation';
import { dietaryRuleIdsForTag } from '~/lib/dietary-projection';
import { isDietaryTag } from '~/lib/substitutions';
import { db, isDbConfigured } from '~/server/db';
import { recipes } from '~/server/db/schema';
import {
  loadDietaryAssessmentReadBatch,
  type DietaryAssessmentReadAuthorization,
} from './assessments';

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
    scope: 'canonical',
    profileId: null,
    source: 'author-confirmed',
    verdict: 'meets',
    confidence: null,
    recognizedIngredients: totalIngredients,
    totalIngredients,
    attentionIngredients: [],
  }));
}

/**
 * Attach current assessment facts to a page of recipe cards in batched reads.
 * Signed-in callers receive only their authorized personal/profile rows in
 * addition to canonical facts. Anonymous callers receive the public projection
 * without ingredient-level evidence identifiers.
 */
export async function attachCardDietaryData<
  T extends { id: string; dietaryFlags?: readonly string[] | null },
>(
  rows: T[],
  actorId: string | null = null,
  authorization: DietaryAssessmentReadAuthorization = {},
): Promise<(T & { dietary: CardDietaryData })[]> {
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
  const [batch, declarationRows] = await Promise.all([
    loadDietaryAssessmentReadBatch(recipeIds, actorId, authorization),
    db.query.recipes.findMany({
      where: inArray(recipes.id, recipeIds),
      columns: { id: true, dietaryFlags: true },
    }),
  ]);

  const ingredientsByRecipe = new Map<string, { id: string; name: string }[]>();
  const ingredientRecipe = new Map<string, string>();
  const ingredientName = new Map<string, string>();
  const assessmentsByRecipe = new Map<string, DietaryAssessmentView[]>();
  for (const recipeId of recipeIds) {
    const inputs = batch.ingredientsByRecipeId.get(recipeId) ?? [];
    const ingredients = inputs.map((ingredient) => ({
      id: ingredient.ingredientId,
      name: ingredient.item,
    }));
    ingredientsByRecipe.set(recipeId, ingredients);
    for (const ingredient of ingredients) {
      ingredientRecipe.set(ingredient.id, recipeId);
      ingredientName.set(ingredient.id, ingredient.name);
    }
  }
  for (const [recipeId, assessmentRows] of batch.assessmentsByRecipeId) {
    const ingredients = ingredientsByRecipe.get(recipeId) ?? [];
    for (const row of assessmentRows) {
      if (!row.ruleId) continue;
      if (
        actorId == null &&
        row.source !== 'author-confirmed' &&
        (row.confidence !== 'high' || row.verdict === 'unknown')
      ) {
        continue;
      }
      const evidenceByIngredient = new Map<string, typeof row.evidence>();
      for (const evidence of row.evidence) {
        const entries = evidenceByIngredient.get(evidence.ingredientId) ?? [];
        entries.push(evidence);
        evidenceByIngredient.set(evidence.ingredientId, entries);
      }
      const effectiveEvidence = [...evidenceByIngredient.values()].flatMap((entries) => {
        const corrections = entries.filter(
          (evidence) => evidence.source === 'ingredient-correction',
        );
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
        if (ingredientRecipe.get(evidence.ingredientId) !== recipeId) continue;
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
      const list = assessmentsByRecipe.get(recipeId) ?? [];
      list.push({
        ruleId: row.ruleId,
        scope: dietaryAssessmentScopeSchema.parse(row.scope),
        profileId: row.profileId,
        source: dietaryAssessmentSourceSchema.parse(row.source),
        verdict: dietaryVerdictSchema.parse(row.verdict),
        confidence: dietaryConfidenceSchema.nullable().parse(row.confidence),
        recognizedIngredients: recognizedIds.size,
        totalIngredients: ingredients.length,
        attentionIngredients: [...attentionByIngredient.values()],
      });
      assessmentsByRecipe.set(recipeId, list);
    }
  }
  const declarationsByRecipe = new Map(
    declarationRows.map((row) => [row.id, row.dietaryFlags] as const),
  );

  return rows.map((row) => {
    const ingredients = ingredientsByRecipe.get(row.id) ?? [];
    const persisted = (assessmentsByRecipe.get(row.id) ?? []).map((assessment) =>
      actorId == null ? { ...assessment, attentionIngredients: [] } : assessment,
    );
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
        ingredients: actorId == null ? [] : ingredients,
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
    const key = `${assessment.scope ?? 'canonical'}:${assessment.profileId ?? ''}:${assessment.ruleId}`;
    const rows = byRule.get(key) ?? [];
    rows.push(assessment);
    byRule.set(key, rows);
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
  shareToken?: string | null,
): Promise<DietaryAssessmentView[]> {
  const [recipe] = await attachCardDietaryData([{ id: recipeId }], null, { shareToken });
  return selectEffectiveViews(recipe?.dietary.assessments ?? []);
}

/** Canonical rule badges for a recipe detail page, ordered by attention first. */
export async function listRecipeDietaryAssessmentViews(
  recipeId: string,
  actorId: string,
): Promise<DietaryAssessmentView[]> {
  if (!isDbConfigured()) return [];
  const [recipe] = await attachCardDietaryData([{ id: recipeId }], actorId);
  return selectEffectiveViews(recipe?.dietary.assessments ?? []);
}
