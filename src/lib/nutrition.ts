/**
 * Per-serving nutrition math. Recipes store nutrition *per serving* (issue
 * #414); this module turns those stored numbers into the rows a facts panel
 * renders and scales them to a whole-recipe total when asked.
 *
 * Everything here is pure and framework-free so the scaling is exhaustively
 * unit-testable and can be reused by the recipe view, cook mode, and the
 * JSON-LD builder alike.
 */

/** A per-serving nutrition record. Every field is optional and may be null. */
export type Nutrition = {
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  saturatedFatGrams?: number | null;
  sodiumMg?: number | null;
  sugarGrams?: number | null;
  fiberGrams?: number | null;
};

export type NutrientKey = keyof Nutrition;

export type NutrientMeta = {
  key: NutrientKey;
  label: string;
  unit: string;
  /** Fractional digits shown for this nutrient (energy/sodium are whole). */
  decimals: number;
};

/**
 * Display order and formatting, following a standard Nutrition Facts label:
 * calories, fats, sodium, carbohydrates (with fiber/sugar), then protein.
 */
export const NUTRIENTS: readonly NutrientMeta[] = [
  { key: "calories", label: "Calories", unit: "kcal", decimals: 0 },
  { key: "fatGrams", label: "Total fat", unit: "g", decimals: 1 },
  { key: "saturatedFatGrams", label: "Saturated fat", unit: "g", decimals: 1 },
  { key: "sodiumMg", label: "Sodium", unit: "mg", decimals: 0 },
  { key: "carbsGrams", label: "Total carbohydrate", unit: "g", decimals: 1 },
  { key: "fiberGrams", label: "Dietary fiber", unit: "g", decimals: 1 },
  { key: "sugarGrams", label: "Sugars", unit: "g", decimals: 1 },
  { key: "proteinGrams", label: "Protein", unit: "g", decimals: 1 },
];

/** Pull just the nutrition fields out of a wider record (e.g. a recipe row). */
export function pickNutrition(row: Nutrition): Nutrition {
  const out: Nutrition = {};
  for (const { key } of NUTRIENTS) out[key] = row[key] ?? null;
  return out;
}

/** True when at least one nutrient has a usable (non-null) value. */
export function hasNutrition(n: Nutrition): boolean {
  return NUTRIENTS.some((m) => {
    const v = n[m.key];
    return typeof v === "number" && Number.isFinite(v);
  });
}

/**
 * Scale a per-serving record by `factor`. Used to derive whole-recipe totals
 * (`factor` = the current serving count). Absent nutrients stay absent; present
 * ones are multiplied. A non-finite or negative factor is treated as 1 so the
 * panel can never show nonsense from a bad serving count.
 */
export function scaleNutrition(perServing: Nutrition, factor: number): Nutrition {
  const safe = Number.isFinite(factor) && factor >= 0 ? factor : 1;
  const out: Nutrition = {};
  for (const { key } of NUTRIENTS) {
    const v = perServing[key];
    out[key] = typeof v === "number" && Number.isFinite(v) ? v * safe : null;
  }
  return out;
}

export type NutritionRow = {
  key: NutrientKey;
  label: string;
  unit: string;
  value: number;
  decimals: number;
};

/** The present nutrients, in label order, ready to render. */
export function nutritionRows(n: Nutrition): NutritionRow[] {
  return NUTRIENTS.flatMap((m) => {
    const v = n[m.key];
    if (typeof v !== "number" || !Number.isFinite(v)) return [];
    return [
      { key: m.key, label: m.label, unit: m.unit, value: v, decimals: m.decimals },
    ];
  });
}

/** Round a value to its nutrient precision and format with thousands grouping. */
export function formatNutrient(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * At-a-glance dietary flags (issue #416). Sodium and (added) sugar drive most
 * everyday dietary goals, so we classify each *per serving* against its FDA
 * Daily Value and surface a low/moderate/high band the UI can badge.
 *
 * Note: the schema stores total sugars, which we treat as the added-sugar proxy
 * against the 50 g DV — honest labelling ("Sugars") keeps that explicit.
 */
export type NutrientLevel = "low" | "moderate" | "high";

/**
 * FDA Daily Values used for %DV, kept in one place so thresholds are easy to
 * audit and adjust. Sodium 2300 mg; added sugars 50 g (2000 kcal reference).
 */
export const DAILY_VALUES = [
  { key: "sodiumMg", label: "Sodium", unit: "mg", dailyValue: 2300 },
  { key: "sugarGrams", label: "Sugars", unit: "g", dailyValue: 50 },
] as const satisfies readonly {
  key: NutrientKey;
  label: string;
  unit: string;
  dailyValue: number;
}[];

/**
 * FDA "5/20 rule" bands: ≤5% DV is low, ≥20% DV is high, anything between is
 * moderate. Adjust here to retune every badge at once.
 */
export const LEVEL_THRESHOLDS = { lowMaxPercent: 5, highMinPercent: 20 } as const;

export function classifyLevel(percentDV: number): NutrientLevel {
  if (percentDV <= LEVEL_THRESHOLDS.lowMaxPercent) return "low";
  if (percentDV >= LEVEL_THRESHOLDS.highMinPercent) return "high";
  return "moderate";
}

export type DailyValueFlag = {
  key: NutrientKey;
  label: string;
  unit: string;
  amount: number;
  percentDV: number;
  level: NutrientLevel;
};

/**
 * Per-serving %DV assessment for a single flaggable nutrient, or null when the
 * recipe doesn't carry that value. `percentDV` is rounded for display, but the
 * band is derived from the exact ratio so a value never lands in the wrong band
 * due to rounding.
 */
export function assessDailyValue(
  perServing: Nutrition,
  key: (typeof DAILY_VALUES)[number]["key"],
): DailyValueFlag | null {
  const meta = DAILY_VALUES.find((d) => d.key === key);
  if (!meta) return null;
  const value = perServing[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const exactPercent = (value / meta.dailyValue) * 100;
  return {
    key: meta.key,
    label: meta.label,
    unit: meta.unit,
    amount: value,
    percentDV: Math.round(exactPercent),
    level: classifyLevel(exactPercent),
  };
}

/** All available per-serving dietary flags (sodium, sugar), in order. */
export function nutritionFlags(perServing: Nutrition): DailyValueFlag[] {
  return DAILY_VALUES.flatMap((d) => {
    const flag = assessDailyValue(perServing, d.key);
    return flag ? [flag] : [];
  });
}

/**
 * How a serving's calories fit a family member's daily calorie goal (issue
 * #430). A bare calorie count doesn't answer the question a cook actually asks
 * — "how much of today's budget is this?" — so we frame it against the goal set
 * on a dietary profile.
 *
 * Returns a rounded percentage, or null when either input is missing or the
 * goal is nonpositive, so the UI hides the indicator rather than rendering
 * "NaN%" or a meaningless value. Zero calories is a legitimate 0%.
 */
export function caloriePercentOfGoal(
  calories: number | null | undefined,
  dailyGoal: number | null | undefined,
): number | null {
  if (typeof calories !== "number" || !Number.isFinite(calories) || calories < 0) {
    return null;
  }
  if (
    typeof dailyGoal !== "number" ||
    !Number.isFinite(dailyGoal) ||
    dailyGoal <= 0
  ) {
    return null;
  }
  return Math.round((calories / dailyGoal) * 100);
}
