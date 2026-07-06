/**
 * Pure, framework-free display helpers for the cooking journal. Kept out of the
 * `server-only` query module so they can be unit-tested and reused on the client.
 */

/** Human-friendly "cooked N times" label (e.g. 0 -> "Not cooked yet"). */
export function cookedTimesLabel(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safe <= 0) return "Not cooked yet";
  if (safe === 1) return "Cooked once";
  if (safe === 2) return "Cooked twice";
  return `Cooked ${safe} times`;
}

/** "4 servings" / "1 serving", or `null` when no count was recorded. */
export function formatServingsMade(
  servingsMade?: number | null,
): string | null {
  if (servingsMade == null || !Number.isFinite(servingsMade)) return null;
  const n = Math.max(0, Math.floor(servingsMade));
  if (n <= 0) return null;
  return `${n} ${n === 1 ? "serving" : "servings"}`;
}
