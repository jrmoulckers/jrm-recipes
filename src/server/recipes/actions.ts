"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { recipeDetailPath } from "~/lib/recipe-path";
import { importRecipeFromUrl, type ImportResult } from "./import";
import { recipeInput, type RecipeInput } from "./validation";
import {
  createRecipe,
  deleteRecipe,
  forkRecipe,
  restoreRecipe,
  revertRecipe,
  updateRecipe,
} from "./mutations";

export type ActionResult =
  | { ok: true; id: string; slug: string | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "Recipes need a database. Set DATABASE_URL (see .env.example) to start saving.";

/**
 * Message shown when a recipe is assigned to a group its author doesn't belong
 * to. Mirrors the `FORBIDDEN` guard in {@link createRecipe}/{@link updateRecipe}
 * back onto the `groupId` field so the editor highlights the group picker.
 */
const GROUP_FORBIDDEN =
  "You can only share a recipe with a group you belong to.";

/** True when a mutation rejected a group assignment for lack of membership. */
function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message === "FORBIDDEN";
}

function groupForbiddenResult(): ActionResult {
  return {
    ok: false,
    error: GROUP_FORBIDDEN,
    fieldErrors: { groupId: [GROUP_FORBIDDEN] },
  };
}

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
  try {
    const recipe = await createRecipe(parsed.data, user);
    revalidatePath("/recipes");
    revalidatePath("/");
    revalidatePath(recipeDetailPath(recipe));
    return { ok: true, id: recipe.id, slug: recipe.slug };
  } catch (error) {
    if (isForbidden(error)) return groupForbiddenResult();
    throw error;
  }
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
    revalidatePath(recipeDetailPath(recipe));
    return { ok: true, id, slug: recipe.slug };
  } catch (error) {
    if (isForbidden(error)) return groupForbiddenResult();
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
    revalidatePath(recipeDetailPath(recipe.source));
    return { ok: true, id: recipe.id, slug: recipe.slug };
  } catch {
    return {
      ok: false,
      error: "We couldn't find that recipe to adapt.",
    };
  }
}

/**
 * Fork a recipe the current user can view into a new adaptation they own.
 * Named alias for `forkRecipeAction` matching the "create adaptation" UX.
 */
export async function createAdaptationAction(
  recipeId: string,
  adaptationNote?: string,
): Promise<ActionResult> {
  return forkRecipeAction(recipeId, adaptationNote);
}

export async function revertRecipeAction(
  recipeId: string,
  versionNumber: number,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  try {
    const user = await requireUser();
    const recipe = await revertRecipe(recipeId, versionNumber, user);
    revalidatePath(recipeDetailPath(recipe));
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

export async function importRecipeFromUrlAction(
  url: string,
): Promise<ImportResult> {
  // Tie the fetch to an authenticated session so it isn't an open proxy.
  await requireUser();
  return importRecipeFromUrl(url);
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

/**
 * Restore a soft-deleted recipe (issue #165). Owner-guarded via
 * {@link restoreRecipe}; on success the recipe and its preserved history return,
 * so we revalidate the library and the recipe's detail page and send the owner
 * back to it. A failed restore (not found / not owner) resolves to `false`.
 */
export async function restoreRecipeAction(id: string): Promise<boolean> {
  if (!isDbConfigured()) return false;
  const user = await requireUser();
  let restored: { id: string; slug: string } | null = null;
  try {
    restored = await restoreRecipe(id, user);
  } catch {
    return false;
  }
  revalidatePath("/recipes");
  revalidatePath(recipeDetailPath(restored));
  return true;
}
