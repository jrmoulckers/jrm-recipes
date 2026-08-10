import type { Route } from "next";

/**
 * Minimal shape needed to build a recipe's canonical detail path.
 *
 * `cook` is the author's user slug — the namespace the recipe lives in (#666).
 * It is optional so the many call sites that only hold a recipe row can still
 * build a working link: without it we emit the flat legacy path, which the
 * `/recipes/[cook]` resolver 308s to the canonical URL.
 */
export type RecipeDetailRef = {
  id: string;
  slug: string | null;
  cook?: string | null;
};

/** The namespaced segment pair, or `null` when the cook slug is unknown. */
function namespaced(recipe: RecipeDetailRef): string | null {
  if (!recipe.cook || !recipe.slug) return null;
  return `${recipe.cook}/${recipe.slug}`;
}

/**
 * The canonical detail route for a recipe: `/recipes/<cook>/<slug>`.
 *
 * This is the single source of truth for that path so the id, slug, and
 * namespaced forms can't diverge. It degrades in two steps: without a cook slug
 * it emits the flat `/recipes/<slug>` legacy path, and without a slug it falls
 * back to the id. Both still resolve — the legacy route redirects to canonical —
 * so a caller that can't reach the author never produces a dead link.
 *
 * Server mutations must revalidate every path a recipe answers on, not just
 * this one; see {@link recipeRevalidationPaths}.
 */
export function recipeDetailPath(recipe: RecipeDetailRef): Route {
  // Each segment is slash-free (slugs and ids are single URL segments), so this
  // resolves to a real route. TS can't prove that of a runtime string, so this
  // builder is the one place that asserts the typed Route (#189).
  return `/recipes/${namespaced(recipe) ?? recipe.slug ?? recipe.id}` as Route;
}

/** The editor route for a recipe, built from the same canonical segments. */
export function recipeEditPath(recipe: RecipeDetailRef): Route {
  return `${recipeDetailPath(recipe)}/edit` as Route;
}

/** The hands-free Cook Mode route for a recipe. */
export function recipeCookPath(recipe: RecipeDetailRef): Route {
  return `${recipeDetailPath(recipe)}/cook` as Route;
}

/** The print-friendly route for a recipe. */
export function recipePrintPath(recipe: RecipeDetailRef): Route {
  return `${recipeDetailPath(recipe)}/print` as Route;
}

/** The keepsake-card route for a recipe. */
export function recipeKeepsakePath(recipe: RecipeDetailRef): Route {
  return `${recipeDetailPath(recipe)}/keepsake` as Route;
}

/**
 * A namespace a recipe *additionally* answers in because of a co-creator
 * (#668): the creator's user slug plus the slug allocated inside their
 * namespace. Both are required — a pending invitation has no slug and therefore
 * no path, which is the whole point of the pending state.
 */
export type RecipeCreatorRef = { cook: string; slug: string };

/**
 * Every path that serves this recipe's detail document and therefore has to be
 * revalidated together after a write (#666, #668).
 *
 * A recipe now answers on its canonical namespaced path, on the flat legacy
 * path, and on one path per accepted co-creator — and the App Router caches all
 * of them independently, so busting only the canonical one leaves anybody
 * arriving from an old shared link (the majority of inbound traffic for an
 * established recipe) or from a co-creator's namespace looking at stale
 * content. Retired aliases are deliberately not included: they are redirects,
 * not cached documents, and their target is the canonical path we already bust.
 *
 * Creator paths are folded in here rather than into a parallel helper so there
 * stays exactly one answer to "where does this recipe live", and adding a
 * caller can't accidentally opt out of half of it. Purging them is not a
 * nicety: it is the cache half of revocation, and without it a removed
 * creator's page keeps being served from the cache after the row is gone.
 */
export function recipeRevalidationPaths(
  recipe: RecipeDetailRef,
  creators: RecipeCreatorRef[] = [],
): Route[] {
  const canonical = recipeDetailPath(recipe);
  const paths: Route[] = [canonical];
  const flat = `/recipes/${recipe.slug ?? recipe.id}` as Route;
  if (flat !== canonical) paths.push(flat);
  for (const creator of creators) {
    const path = recipeDetailPath({
      id: recipe.id,
      slug: creator.slug,
      cook: creator.cook,
    });
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}
