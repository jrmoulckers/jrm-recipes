"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "~/server/auth";
import { db, isDbConfigured } from "~/server/db";
import { recipes } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import {
  type ActionResult as BaseActionResult,
  fail,
  ok,
} from "~/server/action-result";
import { authedAction, NEEDS_DATABASE } from "~/server/action";
import { recipeDetailPath } from "~/lib/recipe-path";
import { absoluteUrl } from "~/lib/utils";
import { domainCodeOf, messageForError } from "~/server/errors";
import { isAnalyticsConfigured } from "~/lib/analytics/config";
import { captureServer } from "~/lib/analytics/server";
import { getLimitStatus } from "~/server/billing/entitlements";
import { checkRateLimit, RATE_LIMITED_MESSAGE } from "~/server/rate-limit";
import { importRecipeFromUrl, type ImportResult } from "./import";
import { recipeInput, type RecipeInput } from "./validation";
import { recipeMutationTags, recipeTag } from "./cache-tags";
import { diffRecipeSnapshots, type RecipeDiff } from "~/lib/recipe-diff";
import { recipeToInput } from "./timeline";
import { getRecipeForViewer } from "./loaders";
import { getRecipeVersion, parseSnapshot } from "./queries";
import {
  createRecipe,
  deleteRecipe,
  forkRecipe,
  restoreRecipe,
  revertRecipe,
  setShareLinkState,
  updateRecipe,
} from "./mutations";

/** Recipe mutations resolve to the new/affected recipe's id + slug. */
export type ActionResult = BaseActionResult<{ id: string; slug: string | null }>;

/**
 * Message shown when a recipe is assigned to a group its author doesn't belong
 * to. Mirrors the `FORBIDDEN` guard in {@link createRecipe}/{@link updateRecipe}
 * back onto the `groupId` field so the editor highlights the group picker.
 */
const GROUP_FORBIDDEN =
  "You can only share a recipe with a group you belong to.";

/** True when a mutation rejected a group assignment for lack of membership. */
function isForbidden(error: unknown): boolean {
  return domainCodeOf(error) === "FORBIDDEN";
}

function groupForbiddenResult(): ActionResult {
  return fail(GROUP_FORBIDDEN, { groupId: [GROUP_FORBIDDEN] });
}

/**
 * Invalidate the Next data-cache tags for a recipe write: the recipe entity
 * plus the public list feed that may include it (#160). Replaces the bare
 * `revalidateTag(PUBLIC_RECIPES_TAG)` so a write busts its entity tag too.
 */
function revalidateRecipeTags(id: string) {
  for (const tag of recipeMutationTags(id)) revalidateTag(tag);
}

const runCreateRecipe = authedAction({
  input: recipeInput,
  handler: async (data, user): Promise<ActionResult> => {
    // Throttle write spam / storage exhaustion (issue #199).
    if (!checkRateLimit("recipeWrite", user.id).ok) return fail(RATE_LIMITED_MESSAGE);
    // Soft-limit (issue #318): free tiers cap the number of saved recipes. Refuse
    // only *new* creates once at/over the cap and hand the UI an upgrade-flagged
    // result — existing recipes stay fully editable/viewable, and an unlimited plan
    // (or unconfigured billing) resolves to `ok`, so nothing is ever hard-blocked.
    const limit = await getLimitStatus(user, "maxRecipes", "recipes");
    if (limit.state === "blocked") {
      return {
        ok: false,
        upgrade: true,
        error: `You've reached the free plan's limit of ${limit.limit} saved recipes. Upgrade to Family for unlimited recipes — everything you've already saved stays exactly where it is.`,
      };
    }
    try {
      const recipe = await createRecipe(data, user);
      void captureServer(user.id, "recipe_created", {
        recipeId: recipe.id,
        ingredientCount: data.ingredients.length,
        stepCount: data.steps.length,
        hasPhoto: Boolean(data.coverImageUrl),
        visibility: data.visibility,
        source: "manual",
      });
      // Activation funnel (#328): emit first_recipe_created exactly once, when
      // the author's recipe count first reaches 1. Gated on analytics being
      // configured so the default path skips the extra count query.
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
      revalidateRecipeTags(recipe.id);
      return ok({ id: recipe.id, slug: recipe.slug });
    } catch (error) {
      if (isForbidden(error)) return groupForbiddenResult();
      throw error;
    }
  },
});

export async function createRecipeAction(
  input: RecipeInput,
): Promise<ActionResult> {
  return runCreateRecipe(input);
}

const runUpdateRecipe = authedAction({
  input: recipeInput,
  handler: async (data, user, id: string): Promise<ActionResult> => {
    if (!checkRateLimit("recipeWrite", user.id).ok) return fail(RATE_LIMITED_MESSAGE);
    try {
      const recipe = await updateRecipe(id, data, user);
      void captureServer(user.id, "recipe_updated", {
        recipeId: id,
        ingredientCount: data.ingredients.length,
        stepCount: data.steps.length,
        hasPhoto: Boolean(data.coverImageUrl),
        visibility: data.visibility,
      });
      revalidatePath("/recipes");
      revalidatePath(recipeDetailPath(recipe));
      revalidateRecipeTags(id);
      return ok({ id, slug: recipe.slug });
    } catch (error) {
      if (isForbidden(error)) return groupForbiddenResult();
      return fail("We couldn't find that recipe to update.");
    }
  },
});

export async function updateRecipeAction(
  id: string,
  input: RecipeInput,
): Promise<ActionResult> {
  return runUpdateRecipe(id, input);
}

export async function forkRecipeAction(
  sourceId: string,
  forkNote?: string,
): Promise<ActionResult> {
  if (!isDbConfigured()) return fail(NEEDS_DATABASE);
  try {
    const user = await requireUser();
    if (!checkRateLimit("recipeWrite", user.id).ok) return fail(RATE_LIMITED_MESSAGE);
    const recipe = await forkRecipe(sourceId, user, forkNote);
    void captureServer(user.id, "recipe_forked", {
      recipeId: recipe.id,
      sourceId,
    });
    revalidatePath("/recipes");
    revalidatePath(recipeDetailPath(recipe.source));
    revalidateRecipeTags(recipe.id);
    revalidateTag(recipeTag(sourceId));
    return ok({ id: recipe.id, slug: recipe.slug });
  } catch {
    return fail("We couldn't find that recipe to adapt.");
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
  if (!isDbConfigured()) return fail(NEEDS_DATABASE);
  try {
    const user = await requireUser();
    const recipe = await revertRecipe(recipeId, versionNumber, user);
    void captureServer(user.id, "recipe_reverted", {
      recipeId: recipe.id,
      versionNumber,
    });
    revalidatePath(recipeDetailPath(recipe));
    revalidatePath("/recipes");
    revalidateRecipeTags(recipe.id);
    return ok({ id: recipe.id, slug: recipe.slug });
  } catch (error) {
    return fail(
      messageForError(
        error,
        { BAD_SNAPSHOT: "That saved version can't be restored." },
        "We couldn't restore that recipe version.",
      ),
    );
  }
}

/** One end of a version comparison: a saved version number, or the live recipe. */
export type CompareSelection = number | "current";

export type CompareVersionsResult =
  | { ok: true; diff: RecipeDiff }
  | { ok: false; error: string };

/**
 * Diff two points in a recipe's history for the Timeline "Compare" view (#358).
 * Each side is either a saved `versionNumber` or `"current"` (the live recipe).
 * Access is gated by {@link getRecipeForViewer} so only viewers who can see the
 * recipe can read its snapshots; a missing/legacy snapshot diffs as an empty
 * recipe rather than failing.
 */
export async function compareRecipeVersionsAction(
  recipeId: string,
  from: CompareSelection,
  to: CompareSelection,
): Promise<CompareVersionsResult> {
  if (!isDbConfigured()) return { ok: false, error: NEEDS_DATABASE };
  const { recipe } = await getRecipeForViewer(recipeId);
  if (!recipe) return { ok: false, error: "We couldn't find that recipe." };

  const resolve = async (
    selection: CompareSelection,
  ): Promise<RecipeInput | null> => {
    if (selection === "current") return recipeToInput(recipe);
    const version = await getRecipeVersion(recipe.id, selection);
    return version ? parseSnapshot(version.snapshot) : null;
  };

  const [before, after] = await Promise.all([resolve(from), resolve(to)]);
  return { ok: true, diff: diffRecipeSnapshots(before, after) };
}

export async function importRecipeFromUrlAction(
  url: string,
): Promise<ImportResult> {
  // Tie the fetch to an authenticated session so it isn't an open proxy.
  const user = await requireUser();
  // Bound outbound fetches per user so import can't be used for SSRF
  // amplification / high-volume third-party fetches (issue #199).
  if (!checkRateLimit("import", user.id).ok) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  const result = await importRecipeFromUrl(url);
  void captureServer(user.id, "recipe_imported", { ok: result.ok });
  return result;
}

export async function deleteRecipeAction(id: string): Promise<void> {
  if (!isDbConfigured()) return;
  const user = await requireUser();
  if (!checkRateLimit("recipeWrite", user.id).ok) return;
  try {
    await deleteRecipe(id, user);
    void captureServer(user.id, "recipe_deleted", { recipeId: id });
  } catch {
    // Already gone — fall through to the library.
  }
  revalidatePath("/recipes");
  revalidateRecipeTags(id);
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
  revalidateRecipeTags(restored.id);
  return true;
}

/** Result of a share-link change: the new URL (null when revoked) + its state. */
export type ShareLinkActionResult = BaseActionResult<{
  url: string | null;
  enabled: boolean;
}>;

/**
 * Owner-only: disable/enable or rotate an unlisted recipe's share link (#207).
 * Authorization is enforced in {@link setShareLinkState} (row scoped to the
 * author); a non-owner resolves to a generic failure. On success we bust the
 * recipe's cache tags and hand back the fresh token URL (or null when revoked).
 */
export async function setShareLinkStateAction(
  recipeId: string,
  change: { enabled?: boolean; rotate?: boolean },
): Promise<ShareLinkActionResult> {
  if (!isDbConfigured()) return fail(NEEDS_DATABASE);
  const user = await requireUser();
  if (!checkRateLimit("recipeWrite", user.id).ok) return fail(RATE_LIMITED_MESSAGE);
  try {
    const state = await setShareLinkState(recipeId, user, change);
    revalidateRecipeTags(recipeId);
    const url =
      state.shareToken && state.shareLinkEnabled
        ? absoluteUrl(`/r/${state.shareToken}`)
        : null;
    return ok({ url, enabled: state.shareLinkEnabled });
  } catch {
    return fail("We couldn't update that share link.");
  }
}
