"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "~/server/auth";
import { db, isDbConfigured } from "~/server/db";
import { recipes } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { recipeDetailPath } from "~/lib/recipe-path";
import { isAnalyticsConfigured } from "~/lib/analytics/config";
import { captureServer } from "~/lib/analytics/server";
import { importRecipeFromUrl, type ImportResult } from "./import";
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
    void captureServer(user.id, "recipe_created", {
      recipeId: recipe.id,
      ingredientCount: parsed.data.ingredients.length,
      stepCount: parsed.data.steps.length,
      hasPhoto: Boolean(parsed.data.coverImageUrl),
      visibility: parsed.data.visibility,
      source: "manual",
    });
    // Activation funnel (#328): emit first_recipe_created exactly once, when the
    // author's recipe count first reaches 1. Gated on analytics being configured
    // so the default path skips the extra count query.
    if (isAnalyticsConfigured()) {
      const authored = await db.$count(recipes, eq(recipes.authorId, user.id));
      if (authored === 1) {
        void captureServer(user.id, "first_recipe_created", {
          recipeId: recipe.id,
        });
      }
    }
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
    void captureServer(user.id, "recipe_updated", {
      recipeId: id,
      ingredientCount: parsed.data.ingredients.length,
      stepCount: parsed.data.steps.length,
      hasPhoto: Boolean(parsed.data.coverImageUrl),
      visibility: parsed.data.visibility,
    });
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
    void captureServer(user.id, "recipe_forked", {
      recipeId: recipe.id,
      sourceId,
    });
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
    void captureServer(user.id, "recipe_reverted", {
      recipeId: recipe.id,
      versionNumber,
    });
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
  const user = await requireUser();
  const result = await importRecipeFromUrl(url);
  void captureServer(user.id, "recipe_imported", { ok: result.ok });
  return result;
}

export async function deleteRecipeAction(id: string): Promise<void> {
  if (!isDbConfigured()) return;
  const user = await requireUser();
  try {
    await deleteRecipe(id, user);
    void captureServer(user.id, "recipe_deleted", { recipeId: id });
  } catch {
    // Already gone — fall through to the library.
  }
  revalidatePath("/recipes");
  redirect("/recipes");
}
