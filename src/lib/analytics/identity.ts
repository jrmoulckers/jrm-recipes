/**
 * Non-PII identity traits (issue #321).
 *
 * A pure mapping from a user's app-internal facts to the person properties we
 * attach on `identify`. By construction it only ever emits counts, booleans and
 * a coarse timestamp — never an email, name, handle, or Clerk id — so PII can't
 * leak into the analytics tool even before the runtime scrub guard runs. Keeping
 * it dependency-free also makes it trivially unit-testable.
 */

export interface IdentityTraitsInput {
  /** `users.createdAt` — recorded coarsely (date only) as a cohort anchor. */
  createdAt?: Date | string | null;
  /** How many groups the user belongs to. */
  groupCount: number;
  /** Whether the user has authored at least one recipe. */
  hasRecipes: boolean;
  /** True for the shared local dev-bypass user, so it can be filtered out. */
  isDev?: boolean;
}

export type IdentityTraits = {
  created_at?: string;
  group_count: number;
  has_recipes: boolean;
  is_dev: boolean;
  /** True when the user belongs to ≥1 group (household), so their cook activity
   * rolls up to a family for per-household retention (#338). */
  household_active: boolean;
};

/** Coerce a date-ish value to a `YYYY-MM-DD` string, or undefined if invalid. */
function toDateOnly(
  value: Date | string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return undefined;
  return date.toISOString().slice(0, 10);
}

/**
 * Build the non-PII person properties for `identify`. `group_count` is coerced
 * to a non-negative integer so a bad input can never emit a fractional/negative
 * count, and `created_at` is omitted entirely when unknown.
 */
export function buildIdentityTraits(
  input: IdentityTraitsInput,
): IdentityTraits {
  const groupCount = Math.max(0, Math.trunc(input.groupCount) || 0);
  const traits: IdentityTraits = {
    group_count: groupCount,
    has_recipes: input.hasRecipes,
    is_dev: input.isDev ?? false,
    household_active: groupCount > 0,
  };
  const createdAt = toDateOnly(input.createdAt);
  if (createdAt) traits.created_at = createdAt;
  return traits;
}
