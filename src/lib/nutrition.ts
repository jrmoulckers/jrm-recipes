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
