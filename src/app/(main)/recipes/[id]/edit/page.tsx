import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import { getOwnedRecipe, listUserGroups } from "~/server/recipes/queries";
import {
  RecipeEditor,
  type RecipeEditorValue,
} from "~/components/recipe/recipe-editor";

export const metadata = { title: "Edit recipe" };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    difficulty: recipe.difficulty ?? "",
    cuisine: recipe.cuisine ?? "",
    sourceName: recipe.sourceName ?? "",
    sourceUrl: recipe.sourceUrl ?? "",
    notes: recipe.notes ?? "",
    visibility: recipe.visibility,
    status: recipe.status,
    groupId: recipe.groupId ?? "",
    tags: recipe.tags.map(({ tag }) => tag.name).join(", "),
    ingredients: recipe.ingredients.map((ing) => ({
      section: ing.section ?? "",
      quantity: ing.quantity != null ? String(ing.quantity) : "",
      unit: ing.unit ?? "",
      item: ing.item,
      note: ing.note ?? "",
      optional: ing.optional,
    })),
    steps: recipe.steps.map((step) => ({
      instruction: step.instruction,
      timerMinutes:
        step.timerSeconds != null
          ? String(Math.round((step.timerSeconds / 60) * 100) / 100)
          : "",
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
