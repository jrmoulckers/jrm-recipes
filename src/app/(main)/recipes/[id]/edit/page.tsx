import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import { getOwnedRecipe, listUserGroups } from "~/server/recipes/queries";
import {
  RecipeEditor,
  type RecipeEditorValue,
} from "~/components/recipe/recipe-editor";
import { DIETARY_TAGS, type DietaryTag } from "~/lib/substitutions";
import { parseRecipeParams, type RecipeRouteParams } from "~/lib/route-params";

export const metadata = { title: "Edit recipe" };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}) {
  const { id } = await parseRecipeParams(params);
  const user = await getCurrentUser();
  if (!user) redirect(`/recipes/${id}`);

  const recipe = await getOwnedRecipe(id, user.id);
  if (!recipe) notFound();

  const groups = await listUserGroups(user.id);

  const initial: RecipeEditorValue = {
    title: recipe.title,
    description: recipe.description ?? "",
    coverImageUrl: recipe.coverImageUrl ?? "",
    servings: recipe.servings != null ? String(recipe.servings) : "",
    servingsNoun: recipe.servingsNoun ?? "servings",
    prepMinutes: recipe.prepMinutes != null ? String(recipe.prepMinutes) : "",
    cookMinutes: recipe.cookMinutes != null ? String(recipe.cookMinutes) : "",
    restMinutes: recipe.restMinutes != null ? String(recipe.restMinutes) : "",
    makeAheadNote: recipe.makeAheadNote ?? "",
    equipment: (recipe.equipment ?? []).join(", "),
    calories: recipe.calories != null ? String(recipe.calories) : "",
    proteinGrams:
      recipe.proteinGrams != null ? String(recipe.proteinGrams) : "",
    carbsGrams: recipe.carbsGrams != null ? String(recipe.carbsGrams) : "",
    fatGrams: recipe.fatGrams != null ? String(recipe.fatGrams) : "",
    saturatedFatGrams:
      recipe.saturatedFatGrams != null ? String(recipe.saturatedFatGrams) : "",
    sodiumMg: recipe.sodiumMg != null ? String(recipe.sodiumMg) : "",
    sugarGrams: recipe.sugarGrams != null ? String(recipe.sugarGrams) : "",
    fiberGrams: recipe.fiberGrams != null ? String(recipe.fiberGrams) : "",
    difficulty: recipe.difficulty ?? "",
    cuisine: recipe.cuisine ?? "",
    sourceName: recipe.sourceName ?? "",
    sourceUrl: recipe.sourceUrl ?? "",
    notes: recipe.notes ?? "",
    story: recipe.story ?? "",
    handedDownFrom: recipe.handedDownFrom ?? "",
    originYear: recipe.originYear ?? "",
    originPlace: recipe.originPlace ?? "",
    visibility: recipe.visibility,
    status: recipe.status,
    groupId: recipe.groupId ?? "",
    tags: recipe.tags.map(({ tag }) => tag.name).join(", "),
    dietaryFlags: (recipe.dietaryFlags ?? []).filter((t): t is DietaryTag =>
      (DIETARY_TAGS as readonly string[]).includes(t),
    ),
    ingredients: recipe.ingredients.map((ing) => ({
      section: ing.section ?? "",
      quantity: ing.quantity != null ? String(ing.quantity) : "",
      quantityMax: ing.quantityMax != null ? String(ing.quantityMax) : "",
      unit: ing.unit ?? "",
      item: ing.item,
      note: ing.note ?? "",
      prep: ing.prep ?? "",
      stepPosition: ing.stepPosition != null ? String(ing.stepPosition) : "",
      optional: ing.optional,
    })),
    steps: recipe.steps.map((step) => ({
      section: step.section ?? "",
      instruction: step.instruction,
      imageUrl: step.imageUrl ?? "",
      videoUrl: step.videoUrl ?? "",
      timerMinutes:
        step.timerSeconds != null
          ? String(Math.round((step.timerSeconds / 60) * 100) / 100)
          : "",
      targetTempC: step.targetTempC != null ? String(step.targetTempC) : "",
      doneness: step.doneness ?? "",
      techniques: (step.techniques ?? []).join(", "),
    })),
  };

  return (
    <RecipeEditor
      mode="edit"
      recipeId={recipe.id}
      initial={initial}
      groups={groups}
    />
  );
}
