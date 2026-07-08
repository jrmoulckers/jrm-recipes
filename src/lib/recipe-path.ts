/** Minimal shape needed to build a recipe's canonical detail path. */
export type RecipeDetailRef = { id: string; slug: string | null };

/**
 * The canonical detail route for a recipe.
 *
 * The `/recipes/[id]` route loader accepts an id *or* a slug, but every
 * canonical reference — the detail page's `generateMetadata` canonical link and
 * the editor's post-save `router.push` — uses the slug. Server mutations must
 * therefore revalidate that same slug-based path, or an edit busts a path
 * nobody is viewing and the slug page serves stale content.
 *
 * This is the single source of truth for that path so the id and slug forms
 * can't diverge again. It falls back to the id only when a recipe has no slug.
 */
export function recipeDetailPath(recipe: RecipeDetailRef): string {
  return `/recipes/${recipe.slug ?? recipe.id}`;
}
