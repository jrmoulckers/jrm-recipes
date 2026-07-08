import type { Route } from "next";

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
export function recipeDetailPath(recipe: RecipeDetailRef): Route {
  // A slug/id is a single URL segment (no slashes), so this resolves to the
  // real `/recipes/[id]` route. TS can't prove a runtime string is slash-free,
  // so this builder is the one place that asserts the typed Route (#189).
  return `/recipes/${recipe.slug ?? recipe.id}` as Route;
}

/** The editor route for a recipe, built from the same canonical segment. */
export function recipeEditPath(recipe: RecipeDetailRef): Route {
  return `/recipes/${recipe.slug ?? recipe.id}/edit` as Route;
}
