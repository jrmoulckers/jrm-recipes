import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

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
import { db } from '~/server/db';
import { dietaryAssessments, recipeIngredients } from '~/server/db/schema';

import { listDietaryAssessmentsForViewer, listPublicDietaryAssessments } from './assessments';

type AssessmentRow = Awaited<ReturnType<typeof listDietaryAssessmentsForViewer>>[number];

function toView(
  row: AssessmentRow,
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

export async function listDietaryAssessmentViews(
  recipeId: string,
  actorId: string | null,
): Promise<DietaryAssessmentView[]> {
  const ingredients = await db.query.recipeIngredients.findMany({
    where: eq(recipeIngredients.recipeId, recipeId),
    columns: { id: true, item: true },
  });
  const ingredientNames = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient.item]),
  );

  if (actorId) {
    const rows = await listDietaryAssessmentsForViewer(recipeId, actorId);
    return effectiveDietaryAssessmentViews(
      rows.flatMap((row) => {
        const view = toView(row, ingredientNames, ingredients.length);
        return view ? [view] : [];
      }),
    );
  }

  const publicAssessments = await listPublicDietaryAssessments(recipeId);
  if (publicAssessments.length === 0) return [];
  const rows = await db.query.dietaryAssessments.findMany({
    where: and(
      eq(dietaryAssessments.recipeId, recipeId),
      eq(dietaryAssessments.scope, 'canonical'),
      isNull(dietaryAssessments.ownerUserId),
      isNull(dietaryAssessments.profileId),
      isNull(dietaryAssessments.customRestrictionId),
      isNull(dietaryAssessments.invalidatedAt),
    ),
    with: { evidence: true },
  });
  return publicAssessments.flatMap((assessment) => {
    const row = rows.find(
      (candidate) =>
        candidate.ruleId === assessment.ruleId &&
        candidate.source === assessment.source &&
        candidate.verdict === assessment.verdict &&
        candidate.confidence === assessment.confidence,
    );
    const view = row ? toView(row, ingredientNames, ingredients.length) : null;
    return view ? [view] : [];
  });
}

export async function attachCardDietaryAssessmentViews<T extends { id: string }>(
  recipes: T[],
  actorId: string | null,
): Promise<(T & { dietaryAssessments: DietaryAssessmentView[] })[]> {
  const assessments = await Promise.all(
    recipes.map((recipe) => listDietaryAssessmentViews(recipe.id, actorId)),
  );
  return recipes.map((recipe, index) => ({
    ...recipe,
    dietaryAssessments: assessments[index] ?? [],
  }));
}
