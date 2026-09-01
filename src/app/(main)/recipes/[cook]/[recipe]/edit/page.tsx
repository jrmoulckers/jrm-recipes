import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { Route } from 'next';

import { getCurrentUser } from '~/server/auth';
import { getEditableRecipe, listUserGroups } from '~/server/recipes/queries';
import { RecipeEditor, type RecipeEditorValue } from '~/components/recipe/recipe-editor';
import { listCustomUnits } from '~/server/units/queries';
import { toCustomUnitDefs } from '~/lib/unit-prefs';
import { isDbConfigured } from '~/server/db';
import { DIETARY_TAGS, type DietaryTag } from '~/lib/substitutions';
import { parseRecipeParams, type RecipeRouteParams } from '~/lib/route-params';
import { groupRecipeClassifications } from '~/lib/recipe-classifications';
import { resolveNamespacedRecipe } from '~/server/recipes/resolve';
import { withRouteMessages } from '~/components/i18n/route-messages';
import { recipeEditPath } from '~/lib/recipe-path';

export const metadata = { title: 'Edit recipe' };

async function EditRecipePage({ params }: { params: Promise<RecipeRouteParams> }) {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const user = await getCurrentUser();
  // A signed-out visitor is bounced to the detail view, which applies the
  // normal visibility rules (and 404s if they may not see it at all).
  if (!user) redirect(`/recipes/${cook}/${recipeSegment}` as Route);

  const resolved = await resolveNamespacedRecipe(cook, recipeSegment);
  if (!resolved) notFound();

  // The owner, or an accepted co-creator editing under their own namespace
  // (#668). A pending invitee resolves to nothing and gets a 404.
  const recipe = await getEditableRecipe(resolved.recipeId, user.id);
  if (!recipe) notFound();
  if (resolved.disposition === 'alias') {
    permanentRedirect(
      recipeEditPath({
        id: recipe.id,
        slug: recipe.slug,
        cook: recipe.author?.slug,
        authorId: recipe.authorId,
      }),
    );
  }

  const groups = await listUserGroups(user.id);
  const customUnits = isDbConfigured() ? toCustomUnitDefs(await listCustomUnits(user.id)) : [];
  const classifications = groupRecipeClassifications(recipe.tags, recipe.cuisine);

  const initial: RecipeEditorValue = {
    title: recipe.title,
    description: recipe.description ?? '',
    coverImageUrl: recipe.coverImageUrl ?? '',
    coverImageAlt: recipe.coverImageAlt ?? '',
    servings: recipe.servings != null ? String(recipe.servings) : '',
    servingsNoun: recipe.servingsNoun ?? 'servings',
    prepMinutes: recipe.prepMinutes != null ? String(recipe.prepMinutes) : '',
    cookMinutes: recipe.cookMinutes != null ? String(recipe.cookMinutes) : '',
    restMinutes: recipe.restMinutes != null ? String(recipe.restMinutes) : '',
    makeAheadNote: recipe.makeAheadNote ?? '',
    equipment: (recipe.equipment ?? []).join(', '),
    calories: recipe.calories != null ? String(recipe.calories) : '',
    proteinGrams: recipe.proteinGrams != null ? String(recipe.proteinGrams) : '',
    carbsGrams: recipe.carbsGrams != null ? String(recipe.carbsGrams) : '',
    fatGrams: recipe.fatGrams != null ? String(recipe.fatGrams) : '',
    saturatedFatGrams: recipe.saturatedFatGrams != null ? String(recipe.saturatedFatGrams) : '',
    sodiumMg: recipe.sodiumMg != null ? String(recipe.sodiumMg) : '',
    sugarGrams: recipe.sugarGrams != null ? String(recipe.sugarGrams) : '',
    fiberGrams: recipe.fiberGrams != null ? String(recipe.fiberGrams) : '',
    difficulty: recipe.difficulty ?? '',
    cuisines: classifications.cuisine.map((item) => item.name).join(', '),
    mealTypes: classifications.meal.map((item) => item.name).join(', '),
    sourceName: recipe.sourceName ?? '',
    sourceUrl: recipe.sourceUrl ?? '',
    notes: recipe.notes ?? '',
    story: recipe.story ?? '',
    handedDownFrom: recipe.handedDownFrom ?? '',
    originYear: recipe.originYear ?? '',
    originPlace: recipe.originPlace ?? '',
    visibility: recipe.visibility,
    status: recipe.status,
    groupId: recipe.groupId ?? '',
    tags: [...classifications.general, ...classifications.dietary]
      .map((item) => item.name)
      .join(', '),
    dietaryFlags: (recipe.dietaryFlags ?? []).filter((t): t is DietaryTag =>
      (DIETARY_TAGS as readonly string[]).includes(t),
    ),
    ingredients: recipe.ingredients.map((ing) => ({
      section: ing.section ?? '',
      quantity: ing.quantity != null ? String(ing.quantity) : '',
      quantityMax: ing.quantityMax != null ? String(ing.quantityMax) : '',
      unit: ing.unit ?? '',
      item: ing.item,
      note: ing.note ?? '',
      prep: ing.prep ?? '',
      stepPosition: ing.stepPosition != null ? String(ing.stepPosition) : '',
      optional: ing.optional,
    })),
    steps: recipe.steps.map((step) => ({
      section: step.section ?? '',
      title: step.title ?? '',
      instruction: step.instruction,
      imageUrl: step.imageUrl ?? '',
      imageAlt: step.imageAlt ?? '',
      videoUrl: step.videoUrl ?? '',
      timerMinutes:
        step.timerSeconds != null ? String(Math.round((step.timerSeconds / 60) * 100) / 100) : '',
      targetTempC: step.targetTempC != null ? String(step.targetTempC) : '',
      doneness: step.doneness ?? '',
      techniques: (step.techniques ?? []).join(', '),
    })),
  };

  return (
    <RecipeEditor
      mode="edit"
      recipeId={recipe.id}
      draftOwnerId={user.id}
      initial={initial}
      groups={groups}
      customUnits={customUnits}
    />
  );
}

export default withRouteMessages(EditRecipePage);
