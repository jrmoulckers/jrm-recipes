import 'server-only';

import { getSubstitutions } from '~/lib/substitutions';
import { type User } from '~/server/db/schema';
import { DomainError } from '~/server/errors';
import { getRecipe } from '~/server/recipes/queries';
import { updateRecipe } from '~/server/recipes/mutations';
import { recipeWriteInput, type RecipeInput } from '~/server/recipes/validation';

export type ApplyIngredientSubstitutionInput = {
  recipeId: string;
  ingredientId: string;
  expectedItem: string;
  expectedRecipeUpdatedAt: string;
  substitute: string;
};

function recipeInputWithSubstitution(
  recipe: NonNullable<Awaited<ReturnType<typeof getRecipe>>>,
  ingredientId: string,
  substitute: string,
): RecipeInput {
  const cuisines = recipe.tags
    .filter(({ tag }) => tag.category === 'cuisine')
    .map(({ tag }) => tag.name);
  const mealTypes = recipe.tags
    .filter(({ tag }) => tag.category === 'meal')
    .map(({ tag }) => tag.name);
  const generalTags = recipe.tags
    .filter(
      ({ tag }) => tag.category == null || tag.category === 'general' || tag.category === 'dietary',
    )
    .map(({ tag }) => tag.name);

  return recipeWriteInput.parse({
    title: recipe.title,
    description: recipe.description ?? undefined,
    coverImageUrl: recipe.coverImageUrl ?? undefined,
    coverImageAlt: recipe.coverImageAlt ?? undefined,
    servings: recipe.servings ?? undefined,
    servingsNoun: recipe.servingsNoun ?? undefined,
    prepMinutes: recipe.prepMinutes ?? undefined,
    cookMinutes: recipe.cookMinutes ?? undefined,
    totalMinutes: recipe.totalMinutes ?? undefined,
    restMinutes: recipe.restMinutes ?? undefined,
    makeAheadNote: recipe.makeAheadNote ?? undefined,
    equipment: recipe.equipment ?? [],
    difficulty: recipe.difficulty ?? undefined,
    cuisine: recipe.cuisine ?? undefined,
    cuisines: cuisines.length > 0 ? cuisines : recipe.cuisine ? [recipe.cuisine] : [],
    mealTypes,
    sourceName: recipe.sourceName ?? undefined,
    sourceUrl: recipe.sourceUrl ?? undefined,
    notes: recipe.notes ?? undefined,
    story: recipe.story ?? undefined,
    handedDownFrom: recipe.handedDownFrom ?? undefined,
    originYear: recipe.originYear ?? undefined,
    originPlace: recipe.originPlace ?? undefined,
    calories: recipe.calories ?? undefined,
    proteinGrams: recipe.proteinGrams ?? undefined,
    carbsGrams: recipe.carbsGrams ?? undefined,
    fatGrams: recipe.fatGrams ?? undefined,
    saturatedFatGrams: recipe.saturatedFatGrams ?? undefined,
    sodiumMg: recipe.sodiumMg ?? undefined,
    sugarGrams: recipe.sugarGrams ?? undefined,
    fiberGrams: recipe.fiberGrams ?? undefined,
    visibility: recipe.visibility,
    status: recipe.status,
    groupId: recipe.groupId ?? undefined,
    sourceImages: recipe.sourceImages.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      caption: image.caption ?? undefined,
      altText: image.altText ?? undefined,
    })),
    dietaryFlags: recipe.dietaryFlags ?? [],
    ingredients: recipe.ingredients.map((ingredient) => ({
      section: ingredient.section ?? undefined,
      quantity: ingredient.quantity ?? undefined,
      quantityMax: ingredient.quantityMax ?? undefined,
      unit: ingredient.unit ?? undefined,
      item: ingredient.id === ingredientId ? substitute : ingredient.item,
      note: ingredient.note ?? undefined,
      prep: ingredient.prep ?? undefined,
      stepPosition: ingredient.stepPosition ?? undefined,
      optional: ingredient.optional,
    })),
    steps: recipe.steps.map((step) => ({
      section: step.section ?? undefined,
      title: step.title ?? undefined,
      instruction: step.instruction,
      imageUrl: step.imageUrl ?? undefined,
      imageAlt: step.imageAlt ?? undefined,
      videoUrl: step.videoUrl ?? undefined,
      captionUrl: step.captionUrl ?? undefined,
      captionLanguage: step.captionLanguage ?? undefined,
      timerSeconds: step.timerSeconds ?? undefined,
      targetTempC: step.targetTempC ?? undefined,
      doneness: step.doneness ?? undefined,
      techniques: step.techniques ?? [],
    })),
    tags: generalTags,
  });
}

/**
 * Apply one curated substitution through the ordinary recipe write path. That
 * path owns edit authorization, version journaling, ingredient identity
 * synchronization, nutrition invalidation, and dietary recalculation.
 */
export async function applyIngredientSubstitution(
  input: ApplyIngredientSubstitutionInput,
  actor: User,
) {
  const recipe = await getRecipe(input.recipeId, actor);
  if (!recipe) throw new DomainError('NOT_FOUND');

  if (recipe.updatedAt.toISOString() !== input.expectedRecipeUpdatedAt) {
    throw new DomainError('CONFLICT');
  }

  const ingredient = recipe.ingredients.find((candidate) => candidate.id === input.ingredientId);
  if (!ingredient || ingredient.item !== input.expectedItem) {
    throw new DomainError('CONFLICT');
  }

  const isCuratedSubstitution = getSubstitutions(input.expectedItem).some(
    (candidate) => candidate.substitute === input.substitute,
  );
  if (!isCuratedSubstitution) throw new DomainError('INVALID');

  const recipeInput = recipeInputWithSubstitution(recipe, input.ingredientId, input.substitute);
  return updateRecipe(recipe.id, recipeInput, actor, {
    expectedUpdatedAt: new Date(input.expectedRecipeUpdatedAt),
    ingredientIdsByPosition: recipe.ingredients.map((ingredient) =>
      ingredient.id === input.ingredientId ? null : ingredient.id,
    ),
  });
}
