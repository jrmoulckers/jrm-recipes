import "server-only";

import { cache } from "react";

import { getCurrentUser } from "~/server/auth";
import { getRecipe } from "~/server/recipes/queries";

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
