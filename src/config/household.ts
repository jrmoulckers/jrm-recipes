/**
 * Household size — a tiny, server-readable preference (like theme + a11y) that
 * remembers how many people you cook for. When set, it seeds the two places a
 * busy parent otherwise re-scales by hand every time: Cook Mode's initial
 * servings and the shopping-list "add recipe" servings. Stored URL-encoded in a
 * single cookie so the server can apply it with no flash and no DB migration.
 *
 * `null` means "no preference" — behavior is unchanged (each recipe keeps its
 * own `servings`).
 */

/** One cookie holds the household size as a bare integer string. */
export const HOUSEHOLD_COOKIE = "heirloom-household";

/** Sensible seed for the stepper when nothing is set yet. */
export const DEFAULT_HOUSEHOLD = 4;

export const MIN_HOUSEHOLD = 1;
export const MAX_HOUSEHOLD = 20;

/** Clamp any number into the supported household range (rounded to a whole person). */
export function clampHouseholdSize(value: number): number {
  const rounded = Math.round(value);
  if (rounded < MIN_HOUSEHOLD) return MIN_HOUSEHOLD;
  if (rounded > MAX_HOUSEHOLD) return MAX_HOUSEHOLD;
  return rounded;
}

/**
 * Parse a (decoded) cookie/localStorage value into a valid household size, or
 * `null` when unset/invalid so callers fall back to each recipe's own servings.
 */
export function parseHousehold(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampHouseholdSize(n);
}

export function serializeHousehold(size: number): string {
  return String(clampHouseholdSize(size));
}
