/**
 * Pure selection logic for the "Back in the rotation" rail (#426). Kept free of
 * server/database imports so it can be unit tested and reused: given the
 * viewer's favorites and when they last cooked each, pick the ones they haven't
 * made recently, longest-neglected first.
 */

/** Recency window (days) after which a cooked favorite is eligible again. */
export const ROTATION_WINDOW_DAYS = 28;

/** Minimum qualifying favorites before the rail is worth showing. */
export const ROTATION_MIN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Filter `recipes` to favorites not cooked within `windowDays`, ordered so the
 * longest-neglected surface first: never-cooked (in the order supplied), then
 * oldest-cooked ascending. Input order is preserved for ties, so callers can
 * pre-sort never-cooked recipes (e.g. oldest-favorited first).
 */
export function selectBackInRotation<T extends { id: string }>(
  recipes: T[],
  lastCookedAt: Map<string, number>,
  {
    windowDays = ROTATION_WINDOW_DAYS,
    now = Date.now(),
    limit = 12,
  }: { windowDays?: number; now?: number; limit?: number } = {},
): T[] {
  const cutoff = now - windowDays * DAY_MS;
  const qualifying = recipes.filter((recipe) => {
    const last = lastCookedAt.get(recipe.id);
    return last == null || last < cutoff;
  });
  qualifying.sort((a, b) => {
    const la = lastCookedAt.get(a.id);
    const lb = lastCookedAt.get(b.id);
    if (la == null && lb == null) return 0;
    if (la == null) return -1;
    if (lb == null) return 1;
    return la - lb;
  });
  return qualifying.slice(0, limit);
}
