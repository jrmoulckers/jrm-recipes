/**
 * Macro targets (issue #1046) — the pure half.
 *
 * A member's target is versioned: each row states the daily numbers that came
 * into force on a date, and the one that applies to a day is the newest row on
 * or before it. Everything needed to pick that row, validate the numbers, and
 * score an actual intake against them lives here, framework-free, so the
 * settings UI, the server actions, and the retrospective surfaces that score a
 * past week all agree by construction rather than by convention.
 *
 * Targets are declared against {@link NUTRIENT_REGISTRY}, not a fixed list, so
 * a new nutrient becomes targetable from its registry row.
 */

import { NUTRIENT_REGISTRY, type NutritionKey } from './nutrients';
import type { Nutrition } from './nutrition';

/** A member's daily targets. Partial: an absent key means "no target set". */
export type NutritionTargets = Nutrition;

/**
 * A target as it applies to a date: the numbers plus the day they came into
 * force, so a surface can say *which* target it scored against.
 */
export type EffectiveNutritionTarget = {
  id: string;
  profileId: string;
  /** `YYYY-MM-DD`. The day these numbers came into force. */
  effectiveFrom: string;
  targets: NutritionTargets;
};

/**
 * Upper bound per unit. Generous enough for an athlete on a bulk, tight enough
 * to reject a typo'd extra digit. Derived from the nutrient's unit so a new
 * registry row is bounded without another table to edit.
 */
const MAX_BY_UNIT: Record<string, number> = { kcal: 20000, g: 2000, mg: 100000 };

/** The default cap for a unit the registry introduces later. */
const FALLBACK_MAX = 100000;

export type TargetNutrientMeta = {
  key: NutritionKey;
  label: string;
  unit: string;
  decimals: number;
  /** One of the four headline macros, shown before the rest. */
  isMacro: boolean;
  /** Largest accepted daily value for this nutrient. */
  max: number;
};

/**
 * Every nutrient a target can be set for, in Nutrition Facts order. Projected
 * from the registry: adding potassium there makes it targetable here, in the
 * form, and in the validator at once.
 */
export const TARGET_NUTRIENTS: readonly TargetNutrientMeta[] = NUTRIENT_REGISTRY.map((n) => ({
  key: n.nutritionKey,
  label: n.label,
  unit: n.unit,
  decimals: n.displayPrecision,
  isMacro: n.isMacro,
  max: MAX_BY_UNIT[n.unit] ?? FALLBACK_MAX,
}));

const TARGET_META = new Map<string, TargetNutrientMeta>(TARGET_NUTRIENTS.map((n) => [n.key, n]));

/** Look up a target nutrient's declaration, or `undefined` when unknown. */
export function targetNutrient(key: string): TargetNutrientMeta | undefined {
  return TARGET_META.get(key);
}

/**
 * Keep only the keys the registry knows, holding finite values in range. A key
 * left behind by a removed registry row, or written by a newer deploy, is
 * dropped rather than trusted — the same guard `vectorFromRows` applies to the
 * stored nutrient vector, for the same reason: an unknown key can't be labelled
 * and must not leak into a comparison.
 *
 * A stored `0` is preserved. "Zero added sugars" is a real target; "no target"
 * is the absent key.
 */
export function sanitizeTargets(raw: unknown): NutritionTargets {
  if (raw == null || typeof raw !== 'object') return {};
  const out: NutritionTargets = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const meta = TARGET_META.get(key);
    if (!meta) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value < 0 || value > meta.max) continue;
    out[meta.key] = value;
  }
  return out;
}

/** True when at least one nutrient carries a usable target. */
export function hasTargets(targets: NutritionTargets): boolean {
  return TARGET_NUTRIENTS.some((n) => {
    const v = targets[n.key];
    return typeof v === 'number' && Number.isFinite(v);
  });
}

/** The set targets, in display order, ready to render. */
export function targetRows(
  targets: NutritionTargets,
): { key: NutritionKey; label: string; unit: string; value: number; decimals: number }[] {
  return TARGET_NUTRIENTS.flatMap((n) => {
    const v = targets[n.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return [];
    return [{ key: n.key, label: n.label, unit: n.unit, value: v, decimals: n.decimals }];
  });
}

/**
 * Format a `Date` (or an already-ISO string) as the `YYYY-MM-DD` an
 * `effectiveFrom` holds, in **local** time. `toISOString()` is deliberately not
 * used: it converts to UTC first, so an evening in a negative-offset timezone
 * would file today's target under tomorrow.
 */
export function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today as `YYYY-MM-DD`, local time. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** `YYYY-MM-DD`, and a real calendar date rather than `2025-02-31`. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

/**
 * The target in force on `date`: the newest row whose `effectiveFrom` is on or
 * before it, or `null` when the member had set nothing by then.
 *
 * Pure and order-independent so the same rule can be applied to rows already in
 * memory (a batch scoring a whole week) as the database applies to one date.
 * Comparing `YYYY-MM-DD` strings lexicographically is exact — it is the reason
 * the column is a date rather than a timestamp.
 */
export function selectEffectiveTarget<T extends { effectiveFrom: string }>(
  rows: readonly T[],
  date: string,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.effectiveFrom > date) continue;
    if (!best || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best;
}

/**
 * How an actual amount sits against a target, as a rounded percentage. `null`
 * when either side is missing or the target is non-positive, so a surface hides
 * the indicator rather than rendering `NaN%`. Zero intake is a legitimate 0%.
 *
 * Generalizes `caloriePercentOfGoal` to every nutrient; that helper stays as the
 * calorie-shaped call site the recipe panel already uses.
 */
export function percentOfTarget(
  amount: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return null;
  return Math.round((amount / target) * 100);
}

export type TargetComparison = {
  key: NutritionKey;
  label: string;
  unit: string;
  decimals: number;
  actual: number;
  target: number;
  percent: number;
  /** Signed distance from the target, in the nutrient's own unit. */
  remaining: number;
};

/**
 * Score an intake against a target, one row per nutrient the member actually
 * targeted **and** the intake actually carries. A nutrient the intake never
 * sourced is omitted rather than scored as `0`, because an unsourced nutrient is
 * unknown, not absent — reporting "0% of your protein target" for a recipe whose
 * protein could not be resolved is precisely the confident falsehood #1027
 * removed from coverage.
 */
export function compareToTargets(actual: Nutrition, targets: NutritionTargets): TargetComparison[] {
  return TARGET_NUTRIENTS.flatMap((n) => {
    const target = targets[n.key];
    const value = actual[n.key];
    if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return [];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    const percent = percentOfTarget(value, target);
    if (percent === null) return [];
    return [
      {
        key: n.key,
        label: n.label,
        unit: n.unit,
        decimals: n.decimals,
        actual: value,
        target,
        percent,
        remaining: target - value,
      },
    ];
  });
}
