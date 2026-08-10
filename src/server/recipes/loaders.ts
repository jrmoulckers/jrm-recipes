import "server-only";

import { cache } from "react";

import { getCurrentUser } from "~/server/auth";
import { getRecipe } from "~/server/recipes/queries";
import {
  resolveFlatRecipe,
  resolveNamespacedRecipe,
} from "~/server/recipes/resolve";

/**
 * Request-scoped recipe Data-Access Layer (#156).
 *
 * The recipe routes (`recipes/[id]`, `.../cook`, `.../print`) each used to
 * copy-paste the same `const load = cache(async (idOrSlug) => …)` that resolves
 * the current viewer and fetches the recipe. That duplicated the memoization
 * boundary and the access rule (viewer scoping) per file, so they could drift.
 *
 * {@link getRecipeForViewer} is the single request-memoized loader: a page and
 * its `generateMetadata` share one fetch per request because React `cache()`
 * dedupes by argument within a render. New domains should follow the same thin
 * `loaders.ts` pattern.
 */
export const getRecipeForViewer = cache(
  async (idOrSlug: string, shareToken?: string | null) => {
    const user = await getCurrentUser();
    const recipe = await getRecipe(idOrSlug, user, shareToken ?? null);
    return { user, recipe };
  },
);

/** The `{ user, recipe }` shape resolved by {@link getRecipeForViewer}. */
export type RecipeForViewer = Awaited<ReturnType<typeof getRecipeForViewer>>;

/**
 * Same as {@link getRecipeForViewer}, but keyed by the canonical URL segments
 * `/recipes/<cook>/<recipe>` (#666).
 *
 * `canonical` is false when the request arrived on a retained alias — a renamed
 * recipe or a renamed cook. The route only acts on it *after* checking that
 * `recipe` is non-null, i.e. after the viewer has passed `canView`, so an alias
 * can never redirect (and thereby confirm the existence of) a recipe the
 * requester is not allowed to see. An unauthorized viewer gets the same
 * `notFound()` they would get for a slug that never existed.
 */
export const getNamespacedRecipeForViewer = cache(
  async (cook: string, recipe: string, shareToken?: string | null) => {
    const resolved = await resolveNamespacedRecipe(cook, recipe);
    if (!resolved) {
      return { user: await getCurrentUser(), recipe: null, canonical: true };
    }
    const loaded = await getRecipeForViewer(resolved.recipeId, shareToken);
    return { ...loaded, canonical: resolved.canonical };
  },
);

/**
 * Load a recipe from the legacy flat URL `/recipes/<idOrSlug>`.
 *
 * Never canonical: the route always 308s to the namespaced URL once the viewer
 * is known to be allowed to see the recipe.
 */
export const getFlatRecipeForViewer = cache(async (segment: string) => {
  const resolved = await resolveFlatRecipe(segment);
  if (!resolved) return { user: await getCurrentUser(), recipe: null };
  return getRecipeForViewer(resolved.recipeId);
});
