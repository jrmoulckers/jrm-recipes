/**
 * Cache wiring for the public (non-personalized) recipe reads (#215).
 *
 * The tag strings themselves now live in the typed {@link ./cache-tags} helper
 * (#160) — the single source of truth shared by the query layer and the
 * mutation actions. This module re-exports {@link PUBLIC_RECIPES_TAG} for its
 * existing importers and owns the revalidate window used by the discover feed's
 * `unstable_cache`.
 */

export { PUBLIC_RECIPES_TAG } from "./cache-tags";

/**
 * Upper bound (seconds) on how long a cached public recipe page may be served
 * before Next refreshes it in the background. Recipe mutations invalidate the
 * tag immediately; this window just caps staleness if a write ever bypasses tag
 * invalidation (e.g. a direct DB change).
 */
export const PUBLIC_RECIPES_REVALIDATE_SECONDS = 300;
