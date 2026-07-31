/**
 * Slugs a recipe must never be assigned, because they collide with sibling
 * routes under `/recipes/*`.
 *
 * `/recipes/[id]` resolves a recipe by id *or* slug, but Next.js resolves a
 * static segment (`/recipes/new`, `/recipes/tags`, `/recipes/cook-with`) ahead
 * of the dynamic `[id]` segment. So a recipe whose slug equals one of these is
 * unreachable at its canonical `/recipes/<slug>` URL — the form/list page wins,
 * and the freshly created recipe "fails to resolve" right after it's saved.
 *
 * This is the single source of truth for that set. The write path
 * ({@link uniqueSlug}) skips these bases so a reserved slug is never persisted,
 * and the service worker's recipe-page matcher ({@link isRecipePageRequest})
 * uses it to avoid caching those non-recipe routes as recipe documents.
 *
 * Deliberately dependency-free (no `next`, no DOM types) so it can be imported
 * from both server mutations and the WebWorker-typed service-worker bundle.
 */
export const RESERVED_RECIPE_SLUGS: ReadonlySet<string> = new Set([
  "new",
  "cook-with",
  "tags",
]);

/** Whether `slug` collides with a non-recipe route under `/recipes/*`. */
export function isReservedRecipeSlug(slug: string): boolean {
  return RESERVED_RECIPE_SLUGS.has(slug);
}
