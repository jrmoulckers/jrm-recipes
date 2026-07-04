"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { recipeInput, type RecipeInput } from "./validation";
import {
  createRecipe,
  deleteRecipe,
  forkRecipe,
  revertRecipe,
  updateRecipe,
} from "./mutations";

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
      fieldErrors: parsed.error.flatten().fieldErrors,
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
      fieldErrors: parsed.error.flatten().fieldErrors,
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

export async function forkRecipeAction(
  sourceId: string,
  forkNote?: string,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  try {
    const user = await requireUser();
    const recipe = await forkRecipe(sourceId, user, forkNote);
    revalidatePath("/recipes");
    return { ok: true, id: recipe.id, slug: recipe.slug };
  } catch {
    return {
      ok: false,
      error: "We couldn't find that recipe to adapt.",
    };
  }
}

export async function revertRecipeAction(
  recipeId: string,
  versionNumber: number,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  try {
    const user = await requireUser();
    const recipe = await revertRecipe(recipeId, versionNumber, user);
    revalidatePath(`/recipes/${recipeId}`);
    revalidatePath("/recipes");
    return { ok: true, id: recipe.id, slug: recipe.slug };
  } catch (error) {
    const message =
      error instanceof Error && error.message === "BAD_SNAPSHOT"
        ? "That saved version can't be restored."
        : "We couldn't restore that recipe version.";
    return { ok: false, error: message };
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
