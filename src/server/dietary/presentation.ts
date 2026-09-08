import 'server-only';

import {
  dietaryAssessmentScopeSchema,
  dietaryAssessmentSourceSchema,
  dietaryConfidenceSchema,
  dietaryEvidenceFindingSchema,
  dietaryVerdictSchema,
} from '~/lib/dietary-assessment';
import {
  effectiveDietaryAssessmentViews,
  type DietaryAssessmentView,
} from '~/lib/dietary-presentation';

import {
  loadDietaryAssessmentReadBatch,
  type DietaryAssessmentReadAuthorization,
  type DietaryAssessmentReadRow,
} from './assessments';

function toView(
  row: DietaryAssessmentReadRow,
  ingredientNames: ReadonlyMap<string, string>,
  totalIngredients: number,
): DietaryAssessmentView | null {
  if (!row.ruleId) return null;
  const evidence = row.evidence.map((item) => ({
    ingredientId: item.ingredientId,
    ingredient: ingredientNames.get(item.ingredientId) ?? '',
    finding: dietaryEvidenceFindingSchema.parse(item.finding),
  }));
  return {
    ruleId: row.ruleId,
    scope: dietaryAssessmentScopeSchema.parse(row.scope),
    profileId: row.profileId,
    source: dietaryAssessmentSourceSchema.parse(row.source),
    verdict: dietaryVerdictSchema.parse(row.verdict),
    confidence: dietaryConfidenceSchema.nullable().parse(row.confidence),
    recognizedIngredients: new Set(
      evidence.filter((item) => item.finding !== 'unresolved').map((item) => item.ingredientId),
    ).size,
    totalIngredients,
    evidence,
  };
}

export async function listDietaryAssessmentViewsBatch(
  recipeIds: readonly string[],
  actorId: string | null,
  authorization: DietaryAssessmentReadAuthorization = {},
): Promise<Map<string, DietaryAssessmentView[]>> {
  const batch = await loadDietaryAssessmentReadBatch(recipeIds, actorId, authorization);
  return new Map(
    [...new Set(recipeIds)].map((recipeId) => {
      const ingredients = batch.ingredientsByRecipeId.get(recipeId) ?? [];
      const ingredientNames = new Map(
        ingredients.map((ingredient) => [ingredient.ingredientId, ingredient.item]),
      );
      const views = (batch.assessmentsByRecipeId.get(recipeId) ?? []).flatMap((row) => {
        const view = toView(row, ingredientNames, ingredients.length);
        return view ? [view] : [];
      });
      return [recipeId, effectiveDietaryAssessmentViews(views)];
    }),
  );
}

export async function listDietaryAssessmentViews(
  recipeId: string,
  actorId: string | null,
  authorization: DietaryAssessmentReadAuthorization = {},
): Promise<DietaryAssessmentView[]> {
  const viewsByRecipeId = await listDietaryAssessmentViewsBatch([recipeId], actorId, authorization);
  return viewsByRecipeId.get(recipeId) ?? [];
}

export async function attachCardDietaryAssessmentViews<T extends { id: string }>(
  recipes: T[],
  actorId: string | null,
): Promise<(T & { dietaryAssessments: DietaryAssessmentView[] })[]> {
  const assessmentsByRecipeId = await listDietaryAssessmentViewsBatch(
    recipes.map((recipe) => recipe.id),
    actorId,
  );
  return recipes.map((recipe) => ({
    ...recipe,
    dietaryAssessments: assessmentsByRecipeId.get(recipe.id) ?? [],
  }));
}
