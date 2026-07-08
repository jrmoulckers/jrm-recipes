/**
 * Cache wiring for the public (non-personalized) recipe reads (#215).
 *
 * These constants are shared between the query layer (which serves the public
 * discover feed from `unstable_cache`) and the mutation actions (which bust that
 * cache with `revalidateTag`). Keeping them in a dependency-light module lets
 * both `server-only` queries and `"use server"` actions import the same tag
 * without pulling one into the other.
 */

/** Tag applied to every cached public recipe list entry. */
export const PUBLIC_RECIPES_TAG = "recipes:public";

/**
 * Upper bound (seconds) on how long a cached public recipe page may be served
 * before Next refreshes it in the background. Recipe mutations invalidate the
 * tag immediately; this window just caps staleness if a write ever bypasses tag
 * invalidation (e.g. a direct DB change).
 */
export const PUBLIC_RECIPES_REVALIDATE_SECONDS = 300;
