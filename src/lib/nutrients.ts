/**
 * The nutrient registry (issue #1028) — the one place a nutrient is declared.
 *
 * Before this module the same seven nutrients were spelled out by hand in six
 * places: the `Nutrition` type, the `NUTRIENTS` display list, `NutritionFacts`,
 * `NutritionRollup`, the `food_nutrition` columns, and the `recipes` columns.
 * Adding one nutrient cost a migration plus six coordinated edits, and that tax
 * had already produced a defect: `recipes.saturatedFatGrams` existed while
 * `food_nutrition` had no saturated-fat column, so no estimate could ever
 * populate it.
 *
 * Nutrients are *data*, not *schema*. Per-food values now live in the
 * `food_nutrients` vector keyed by {@link NutrientId}, so adding cholesterol,
 * potassium, added sugars or vitamin D is a registry row plus seed values — no
 * migration, no roll-up edit, no formatter edit.
 *
 * This module is pure, framework-free and tiny on purpose: it is client-safe and
 * ships with the recipe page. The `nutrients` table mirrors it (seeded from
 * {@link NUTRIENT_REGISTRY}) exactly the way `food_nutrition` mirrors
 * `food-nutrition.ts`, so a server read never has to join the registry to render
 * a panel.
 *
 * ## Two projections, one declaration
 *
 * A nutrient has two names because it is measured in two bases:
 *  - `id` — the per-100 g basis, used by {@link NutritionFacts} and the
 *    `food_nutrients` vector (`kcal`, `proteinG`, …).
 *  - `nutritionKey` — the per-serving basis, used by the app's `Nutrition` shape
 *    and the denormalized `recipes` macro cache (`calories`, `proteinGrams`, …).
 *
 * Both are declared on the same row, so the mapping exists once instead of being
 * re-spelled at every boundary.
 */

/** Per-100 g nutrient identifier. Also the `food_nutrients.nutrientId` value. */
export type NutrientId =
  'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'satFatG' | 'fiberG' | 'sugarG' | 'sodiumMg';

/** The per-serving key a nutrient occupies in the app's `Nutrition` shape. */
export type NutritionKey =
  | 'calories'
  | 'proteinGrams'
  | 'carbsGrams'
  | 'fatGrams'
  | 'saturatedFatGrams'
  | 'fiberGrams'
  | 'sugarGrams'
  | 'sodiumMg';

/**
 * One nutrient's complete declaration. `dailyValue` is the FDA Daily Value used
 * for %DV, or `null` when the app does not band this nutrient (a value here is
 * what makes a nutrient show up in `nutritionFlags`, so adding one changes the
 * UI deliberately rather than as a side effect).
 */
export type NutrientDef = {
  /** Per-100 g identifier, stable and stored. Never rename without a migration. */
  id: NutrientId;
  /** Per-serving key in the `Nutrition` shape / `recipes` macro cache. */
  nutritionKey: NutritionKey;
  /** English display label. Localized labels live in `messages/*.json`. */
  label: string;
  /** Display unit, identical on both bases (`kcal`, `g`, `mg`). */
  unit: string;
  /** FDA Daily Value for %DV banding, or null when the app doesn't band it. */
  dailyValue: number | null;
  /** Fractional digits shown (energy and sodium are whole numbers). */
  displayPrecision: number;
  /** Nutrition Facts panel order. Sparse so a nutrient can be slotted between. */
  displayOrder: number;
  /** One of the four headline numbers surfaced by {@link macros}. */
  isMacro: boolean;
};

/**
 * Every nutrient the app knows about, in Nutrition Facts panel order: calories,
 * fats, sodium, carbohydrate (with fiber and sugars), then protein.
 *
 * Saturated fat carries a row here for the first time (#1028). It had a
 * `recipes` column and a form field but no source of values, so the panel could
 * only ever show what a cook typed by hand.
 */
export const NUTRIENT_REGISTRY = [
  {
    id: 'kcal',
    nutritionKey: 'calories',
    label: 'Calories',
    unit: 'kcal',
    dailyValue: null,
    displayPrecision: 0,
    displayOrder: 10,
    isMacro: true,
  },
  {
    id: 'fatG',
    nutritionKey: 'fatGrams',
    label: 'Total fat',
    unit: 'g',
    dailyValue: null,
    displayPrecision: 1,
    displayOrder: 20,
    isMacro: true,
  },
  {
    id: 'satFatG',
    nutritionKey: 'saturatedFatGrams',
    label: 'Saturated fat',
    unit: 'g',
    dailyValue: null,
    displayPrecision: 1,
    displayOrder: 30,
    isMacro: false,
  },
  {
    id: 'sodiumMg',
    nutritionKey: 'sodiumMg',
    label: 'Sodium',
    unit: 'mg',
    dailyValue: 2300,
    displayPrecision: 0,
    displayOrder: 40,
    isMacro: false,
  },
  {
    id: 'carbsG',
    nutritionKey: 'carbsGrams',
    label: 'Total carbohydrate',
    unit: 'g',
    dailyValue: null,
    displayPrecision: 1,
    displayOrder: 50,
    isMacro: true,
  },
  {
    id: 'fiberG',
    nutritionKey: 'fiberGrams',
    label: 'Dietary fiber',
    unit: 'g',
    dailyValue: null,
    displayPrecision: 1,
    displayOrder: 60,
    isMacro: false,
  },
  {
    id: 'sugarG',
    nutritionKey: 'sugarGrams',
    label: 'Sugars',
    unit: 'g',
    dailyValue: 50,
    displayPrecision: 1,
    displayOrder: 70,
    isMacro: false,
  },
  {
    id: 'proteinG',
    nutritionKey: 'proteinGrams',
    label: 'Protein',
    unit: 'g',
    dailyValue: null,
    displayPrecision: 1,
    displayOrder: 80,
    isMacro: true,
  },
] as const satisfies readonly NutrientDef[];

/** Every nutrient id, in display order. */
export const NUTRIENT_IDS: readonly NutrientId[] = NUTRIENT_REGISTRY.map((n) => n.id);

const BY_ID = new Map<NutrientId, NutrientDef>(NUTRIENT_REGISTRY.map((n) => [n.id, n]));

/** Look up a nutrient's declaration, or `undefined` for an unknown id. */
export function nutrientById(id: string): NutrientDef | undefined {
  return BY_ID.get(id as NutrientId);
}

/**
 * A nutrient vector: amounts per 100 g, keyed by nutrient id. Partial by
 * construction — an absent key means *unknown*, never zero, because source
 * coverage is uneven.
 */
export type NutrientVector = { [K in NutrientId]?: number };

/**
 * The four headline numbers, always present as plain numbers.
 *
 * The vector is the storage model; this stays the ergonomic read model. Call
 * sites that legitimately want "how many calories and how much protein" should
 * not have to churn into map lookups and `?? 0` just because storage stopped
 * being a fixed set of columns.
 */
export type MacroSummary = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

/**
 * Project a vector onto the four headline macros, defaulting an unknown macro to
 * `0`. Every curated food carries all four, so a `0` here means the caller
 * passed a vector that genuinely lacks them.
 */
export function macros(vector: NutrientVector): MacroSummary {
  return {
    calories: vector.kcal ?? 0,
    protein: vector.proteinG ?? 0,
    fat: vector.fatG ?? 0,
    carbs: vector.carbsG ?? 0,
  };
}

/**
 * Add `vector × factor` into `acc`, in place. Only nutrients the vector actually
 * carries are touched, so a nutrient nothing sourced stays absent from the total
 * rather than being reported as a confident zero. Non-finite amounts are
 * ignored. Returns `acc` for chaining.
 */
export function accumulateVector(
  acc: NutrientVector,
  vector: NutrientVector,
  factor: number,
): NutrientVector {
  if (!Number.isFinite(factor)) return acc;
  for (const id of NUTRIENT_IDS) {
    const v = vector[id];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    acc[id] = (acc[id] ?? 0) + v * factor;
  }
  return acc;
}

/** Scale every present nutrient by `factor`. Absent nutrients stay absent. */
export function scaleVector(vector: NutrientVector, factor: number): NutrientVector {
  return accumulateVector({}, vector, factor);
}

/** True when the vector carries at least one usable amount. */
export function hasNutrients(vector: NutrientVector): boolean {
  return NUTRIENT_IDS.some((id) => {
    const v = vector[id];
    return typeof v === 'number' && Number.isFinite(v);
  });
}

/**
 * Build a vector from stored `food_nutrients` rows. Unknown nutrient ids are
 * skipped rather than trusted, so a row left behind by a removed registry entry
 * (or written by a newer deploy) can never leak into a total under a key nothing
 * knows how to label.
 */
export function vectorFromRows(
  rows: readonly { nutrientId: string; per100g: number | null }[],
): NutrientVector {
  const out: NutrientVector = {};
  for (const row of rows) {
    const def = BY_ID.get(row.nutrientId as NutrientId);
    if (!def) continue;
    if (typeof row.per100g !== 'number' || !Number.isFinite(row.per100g)) continue;
    out[def.id] = row.per100g;
  }
  return out;
}

/**
 * Project a per-100 g vector onto the app's per-serving `Nutrition` key space.
 * The amounts are passed through unchanged — this only renames the axis — so the
 * caller is responsible for having already scaled by grams and servings.
 */
export function toNutritionKeys(vector: NutrientVector): { [K in NutritionKey]?: number } {
  const out: { [K in NutritionKey]?: number } = {};
  for (const def of NUTRIENT_REGISTRY) {
    const v = vector[def.id];
    if (typeof v === 'number' && Number.isFinite(v)) out[def.nutritionKey] = v;
  }
  return out;
}
