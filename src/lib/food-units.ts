/**
 * Food-type → suggested-units mapping and the public {@link getSuggestedUnitsForFood}
 * API that the interchangeable-units picker consumes. Given a free-text
 * ingredient, it returns an **ordered, most-appropriate-first** list of unit
 * suggestions so the recipe editor can pre-populate / prioritize its unit
 * picker: a liquid surfaces cups/mL, a spice tsp/tbsp/pinch/g, a whole vegetable
 * count/each/g.
 *
 * Pure and synchronous (safe to call in a client component), and deliberately
 * decoupled from `units.ts`: {@link FoodDimension} is structurally identical to
 * that module's `Dimension`, and `unit` strings use its canonical tokens where
 * one exists (`cup`, `tbsp`, `tsp`, `fl oz`, `ml`, `l`, `g`, `kg`, `oz`, `lb`).
 * Informal count units (`each`, `pinch`, `bunch`, `sprig`) are returned as
 * literal tokens for the units layer / user's custom-units table to resolve.
 */

import {
  foodCategoryForItem,
  type FoodCategory,
  FOOD_CATEGORIES,
} from "./food-db";

/**
 * The measurement dimension of a suggested unit. Mirrors `units.ts` `Dimension`
 * exactly (kept as a local declaration to avoid coupling this module to the
 * conversion library). The two are structurally interchangeable.
 */
export type FoodDimension = "volume" | "mass" | "count" | "temperature";

/** One suggested unit: its dimension plus a unit token (see module doc). */
export type SuggestedUnit = {
  dimension: FoodDimension;
  /**
   * Canonical `units.ts` token where one exists (`cup`, `tbsp`, `tsp`,
   * `fl oz`, `ml`, `l`, `g`, `kg`, `oz`, `lb`). Otherwise an informal
   * count/portion token (`each`, `pinch`, `bunch`, `sprig`, `clove`) for the
   * units layer to resolve against the user's units / custom units.
   */
  unit: string;
};

// Reusable ordered building blocks so the per-category tables stay readable and
// consistent. Each expresses "how a cook most naturally measures this", best
// choice first, spanning both US and metric so the picker can respect the
// user's system preference downstream.
const VOLUME_LARGE: SuggestedUnit[] = [
  { dimension: "volume", unit: "cup" },
  { dimension: "volume", unit: "tbsp" },
  { dimension: "volume", unit: "tsp" },
  { dimension: "volume", unit: "fl oz" },
  { dimension: "volume", unit: "ml" },
  { dimension: "volume", unit: "l" },
];
const MASS_FULL: SuggestedUnit[] = [
  { dimension: "mass", unit: "g" },
  { dimension: "mass", unit: "kg" },
  { dimension: "mass", unit: "oz" },
  { dimension: "mass", unit: "lb" },
];
const MASS_SMALL: SuggestedUnit[] = [
  { dimension: "mass", unit: "g" },
  { dimension: "mass", unit: "oz" },
];
const MASS_LARGE: SuggestedUnit[] = [
  { dimension: "mass", unit: "lb" },
  { dimension: "mass", unit: "oz" },
  { dimension: "mass", unit: "g" },
  { dimension: "mass", unit: "kg" },
];
const COUNT_EACH: SuggestedUnit[] = [{ dimension: "count", unit: "each" }];

/**
 * Ordered unit suggestions per food category. First entry is the most
 * appropriate default for that category. Callers may take the whole list (to
 * prioritize the picker) or just the head (as a smart default unit).
 */
export const CATEGORY_UNIT_SUGGESTIONS: Record<FoodCategory, SuggestedUnit[]> =
  {
    // Liquids: measured by volume. Weight is a secondary option for bakers.
    liquid: [...VOLUME_LARGE, { dimension: "mass", unit: "g" }],
    // Dairy: milk/cream by volume, cheese often by weight. Offer both.
    dairy: [...VOLUME_LARGE, ...MASS_SMALL],
    // Baking staples: weight first (precision), then volume for cup-based recipes.
    baking: [
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
      { dimension: "volume", unit: "cup" },
      { dimension: "volume", unit: "tbsp" },
      { dimension: "volume", unit: "tsp" },
    ],
    // Dry goods (pasta): by weight, sometimes by cup.
    "dry-good": [...MASS_FULL, { dimension: "volume", unit: "cup" }],
    grain: [
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
      { dimension: "mass", unit: "kg" },
    ],
    legume: [
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
      { dimension: "count", unit: "can" },
    ],
    // Whole produce: counted or weighed.
    "produce-whole": [...COUNT_EACH, ...MASS_LARGE],
    // Leafy greens: loose-packed by cup or weighed. Sold by the bunch.
    "produce-leafy": [
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
      { dimension: "count", unit: "bunch" },
    ],
    // Fruit: often by the cup (berries) or counted.
    "produce-fruit": [
      { dimension: "count", unit: "each" },
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
    ],
    // Fresh herbs: small volumes, weighed, or by the bunch/sprig.
    herb: [
      { dimension: "volume", unit: "tbsp" },
      { dimension: "volume", unit: "tsp" },
      { dimension: "count", unit: "bunch" },
      { dimension: "count", unit: "sprig" },
      { dimension: "mass", unit: "g" },
    ],
    // Spices: tiny volumes and pinches. Grams for scale bakers.
    spice: [
      { dimension: "volume", unit: "tsp" },
      { dimension: "volume", unit: "tbsp" },
      { dimension: "count", unit: "pinch" },
      { dimension: "mass", unit: "g" },
    ],
    // Meat & seafood: by weight. Some seafood is counted.
    meat: [...MASS_LARGE],
    seafood: [...MASS_LARGE, { dimension: "count", unit: "each" }],
    // Eggs: counted. Whites/yolks sometimes by volume.
    egg: [
      ...COUNT_EACH,
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
    ],
    // Fats & oils: small-to-medium volumes, weighed for baking.
    "fat-oil": [
      { dimension: "volume", unit: "tbsp" },
      { dimension: "volume", unit: "tsp" },
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
      { dimension: "volume", unit: "ml" },
    ],
    // Syrups & sugars-as-liquid: spoon/cup volumes, weighed for precision.
    sweetener: [
      { dimension: "volume", unit: "tbsp" },
      { dimension: "volume", unit: "tsp" },
      { dimension: "volume", unit: "cup" },
      { dimension: "mass", unit: "g" },
      { dimension: "volume", unit: "ml" },
    ],
    // Nuts & seeds: by cup or weight. Nut butters by spoon.
    "nut-seed": [
      { dimension: "volume", unit: "cup" },
      { dimension: "volume", unit: "tbsp" },
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
    ],
    // Condiments: spoon/cup volumes, weighed occasionally.
    condiment: [
      { dimension: "volume", unit: "tbsp" },
      { dimension: "volume", unit: "tsp" },
      { dimension: "volume", unit: "cup" },
      { dimension: "volume", unit: "ml" },
      { dimension: "mass", unit: "g" },
    ],
    // Unknown: a broad, sensible default covering common measures.
    other: [
      { dimension: "volume", unit: "cup" },
      { dimension: "volume", unit: "tbsp" },
      { dimension: "volume", unit: "tsp" },
      { dimension: "mass", unit: "g" },
      { dimension: "mass", unit: "oz" },
      { dimension: "count", unit: "each" },
    ],
  };

// Guard against drift: every category must have at least one suggestion.
if (
  process.env.NODE_ENV !== "production" &&
  FOOD_CATEGORIES.some((c) => (CATEGORY_UNIT_SUGGESTIONS[c]?.length ?? 0) === 0)
) {
  throw new Error("CATEGORY_UNIT_SUGGESTIONS is missing a food category");
}

/**
 * The ordered unit suggestions for a known food category. Returns a fresh array
 * (safe for callers to sort/splice). Never empty for a valid category.
 */
export function suggestedUnitsForCategory(
  category: FoodCategory,
): SuggestedUnit[] {
  return [...(CATEGORY_UNIT_SUGGESTIONS[category] ?? [])];
}

/**
 * The picker API. Resolve a free-text ingredient to its food category and
 * return that category's ordered, most-appropriate-first unit suggestions.
 * Returns `[]` when the ingredient can't be matched, so the caller can fall
 * back to its own default unit list. Pure + synchronous.
 */
export function getSuggestedUnitsForFood(
  item: string | null | undefined,
): SuggestedUnit[] {
  const category = foodCategoryForItem(item);
  return category ? suggestedUnitsForCategory(category) : [];
}

/**
 * A viewer's volume preferences split by kind of ingredient (pourable liquids
 * vs. Scoopable dry goods vs. Tiny seasoning amounts). This maps a food category
 * to that split. Structurally the same union as `units.ts` `VolumeClass`, kept
 * local to preserve this module's decoupling from the conversion library.
 *
 * Liquids: anything you pour (water, milk, oil, sauces). Small: seasonings you
 * measure by the pinch/teaspoon (herbs, spices). Everything else scoops as a
 * dry good. Unknown ingredients fall back to "dry", the most common case.
 */
export type FoodVolumeClass = "liquid" | "dry" | "small";

const CATEGORY_VOLUME_CLASS: Record<FoodCategory, FoodVolumeClass> = {
  liquid: "liquid",
  dairy: "liquid",
  "fat-oil": "liquid",
  condiment: "liquid",
  herb: "small",
  spice: "small",
  baking: "dry",
  "dry-good": "dry",
  grain: "dry",
  legume: "dry",
  "produce-whole": "dry",
  "produce-leafy": "dry",
  "produce-fruit": "dry",
  sweetener: "dry",
  "nut-seed": "dry",
  meat: "dry",
  seafood: "dry",
  egg: "dry",
  other: "dry",
};

/** The volume class for a category (liquids pour, seasonings pinch, else scoop). */
export function volumeClassForCategory(
  category: FoodCategory,
): FoodVolumeClass {
  return CATEGORY_VOLUME_CLASS[category];
}

/**
 * Classify a free-text ingredient into a volume class so display-time conversion
 * can honor the viewer's per-class volume preference. Defaults to "dry" for
 * unmatched ingredients. Pure + synchronous.
 */
export function volumeClassForItem(
  item: string | null | undefined,
): FoodVolumeClass {
  const category = foodCategoryForItem(item);
  return category ? CATEGORY_VOLUME_CLASS[category] : "dry";
}

// --- Learned-unit merge (live graph enrichment) --------------------------

const VOLUME_TOKENS: ReadonlySet<string> = new Set([
  "cup",
  "tbsp",
  "tsp",
  "fl oz",
  "ml",
  "l",
]);
const MASS_TOKENS: ReadonlySet<string> = new Set(["g", "kg", "oz", "lb"]);
const COUNT_TOKENS: ReadonlySet<string> = new Set([
  "each",
  "pinch",
  "bunch",
  "sprig",
  "clove",
  "can",
]);

/**
 * The measurement dimension for a unit token. Recognizes the canonical
 * `units.ts` volume/mass tokens and the food-graph's informal count/portion
 * tokens. Anything unrecognized is treated as `count` (a literal portion token
 * the units layer resolves), never dropped. Pure.
 */
export function dimensionForUnit(unit: string): FoodDimension {
  const u = unit.trim().toLowerCase();
  if (VOLUME_TOKENS.has(u)) return "volume";
  if (MASS_TOKENS.has(u)) return "mass";
  if (COUNT_TOKENS.has(u)) return "count";
  return "count";
}

/** A unit the corpus has been observed using for a food, with its usage count. */
export type LearnedUnit = { unit: string; useCount: number };

/**
 * Merge a food's **learned** units (mined from the corpus, most-used first) with
 * the static category `fallback`, producing an ordered {@link SuggestedUnit}
 * list for the picker: learned units lead (by usage), then any static
 * suggestions not already present, de-duplicated by unit token. This keeps the
 * `getSuggestedUnitsForFood` shape (flat, ordered, index 0 = default) while
 * letting live data reprioritize it. Pure. When `learned` is empty it returns a
 * copy of `fallback`.
 */
export function mergeLearnedUnits(
  learned: readonly LearnedUnit[],
  fallback: readonly SuggestedUnit[],
): SuggestedUnit[] {
  const seen = new Set<string>();
  const merged: SuggestedUnit[] = [];
  const push = (unit: string, dimension: FoodDimension) => {
    const key = unit.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ dimension, unit });
  };
  for (const { unit } of [...learned].sort((a, b) => b.useCount - a.useCount)) {
    push(unit, dimensionForUnit(unit));
  }
  for (const s of fallback) push(s.unit, s.dimension);
  return merged;
}

/**
 * Float a user's preferred unit to index 0 of an ordered {@link SuggestedUnit}
 * list (Phase 3 personalization). If the preference already appears it is moved
 * to the front (rest order preserved). If it's new it is prepended with its
 * derived dimension. A nullish/empty preference returns a copy unchanged. Same
 * flat, ordered shape (index 0 = default), so it drops into the picker path.
 * Pure.
 */
export function applyUnitPreference(
  units: readonly SuggestedUnit[],
  preferredUnit: string | null | undefined,
): SuggestedUnit[] {
  const pref = (preferredUnit ?? "").trim();
  if (!pref) return [...units];
  const key = pref.toLowerCase();
  const rest = units.filter((u) => u.unit.trim().toLowerCase() !== key);
  const existing = units.find((u) => u.unit.trim().toLowerCase() === key);
  const head: SuggestedUnit = existing ?? {
    dimension: dimensionForUnit(pref),
    unit: pref,
  };
  return [head, ...rest];
}

/**
 * Float a user's preferred value to the front of a ranked token list (prep
 * methods, variety names, …), preserving the order of the rest. Case-insensitive
 * match. A nullish preference or one absent from the list returns a copy
 * unchanged (we never invent a prep/variety that has no crowd signal). Pure.
 */
export function floatPreferredToFront<T>(
  items: readonly T[],
  value: string | null | undefined,
  keyOf: (item: T) => string,
): T[] {
  const pref = (value ?? "").trim().toLowerCase();
  if (!pref) return [...items];
  const match = items.find((it) => keyOf(it).trim().toLowerCase() === pref);
  if (!match) return [...items];
  return [match, ...items.filter((it) => it !== match)];
}
