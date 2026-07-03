"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { recipeInput, type RecipeInput } from "./validation";
import { createRecipe, deleteRecipe, updateRecipe } from "./mutations";

export type ActionResult =
  | { ok: true; id: string; slug: string | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "Recipes need a database. Set DATABASE_URL (see .env.example) to start saving.";

export async function createRecipeAction(
  input: RecipeInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = recipeInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const user = await requireUser();
  const recipe = await createRecipe(parsed.data, user);
  revalidatePath("/recipes");
  revalidatePath("/");
  return { ok: true, id: recipe.id, slug: recipe.slug };
}

export async function updateRecipeAction(
  id: string,
  input: RecipeInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = recipeInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const user = await requireUser();
  try {
    const recipe = await updateRecipe(id, parsed.data, user);
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${id}`);
    return { ok: true, id, slug: recipe.slug };
  } catch {
    return { ok: false, error: "We couldn't find that recipe to update." };
  }
}

export async function deleteRecipeAction(id: string): Promise<void> {
  if (!isDbConfigured()) return;
  const user = await requireUser();
  try {
    await deleteRecipe(id, user);
  } catch {
    // Already gone — fall through to the library.
  }
  revalidatePath("/recipes");
  redirect("/recipes");
}
