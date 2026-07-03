/**
 * Ingredient quantity math: pretty fraction formatting, serving scaling, and
 * unit conversion. Pure and dependency-free so it's shared by the editor, the
 * recipe view, and offline cook mode — and easy to unit-test.
 */

const VULGAR: Array<[number, string]> = [
  [1 / 8, "⅛"],
  [1 / 6, "⅙"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [5 / 6, "⅚"],
  [7 / 8, "⅞"],
];

/** Round to a sensible cooking precision (avoids 0.30000000004). */
export function roundNice(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Format a number the way a recipe would: whole numbers plainly, common
 * fractions as vulgar glyphs (1.5 → "1½"), everything else to 2 decimals.
 */
export function formatQuantity(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  const n = roundNice(value);
  if (n === 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);

  let best: { glyph: string; diff: number } | null = null;
  for (const [f, glyph] of VULGAR) {
    const diff = Math.abs(frac - f);
    if (diff < 0.03 && (!best || diff < best.diff)) best = { glyph, diff };
  }
  if (best) return whole > 0 ? `${whole}${best.glyph}` : best.glyph;

  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

// --- Units --------------------------------------------------------------

export type Dimension = "volume" | "mass" | "count";

type UnitDef = {
  canonical: string;
  dimension: Dimension;
  /** Amount of the dimension's base unit (ml for volume, g for mass). */
  base: number;
  system: "us" | "metric" | "any";
  aliases: string[];
  plural?: string;
};

// Base: volume in milliliters, mass in grams.
const UNIT_DEFS: UnitDef[] = [
  { canonical: "tsp", dimension: "volume", base: 4.92892, system: "us", aliases: ["teaspoon", "teaspoons", "t"] },
  { canonical: "tbsp", dimension: "volume", base: 14.7868, system: "us", aliases: ["tablespoon", "tablespoons", "T", "tbs", "tbl"] },
  { canonical: "fl oz", dimension: "volume", base: 29.5735, system: "us", aliases: ["fluid ounce", "fluid ounces", "floz"] },
  { canonical: "cup", dimension: "volume", base: 236.588, system: "us", aliases: ["cups", "c"], plural: "cups" },
  { canonical: "pint", dimension: "volume", base: 473.176, system: "us", aliases: ["pints", "pt"], plural: "pints" },
  { canonical: "quart", dimension: "volume", base: 946.353, system: "us", aliases: ["quarts", "qt"], plural: "quarts" },
  { canonical: "gallon", dimension: "volume", base: 3785.41, system: "us", aliases: ["gallons", "gal"], plural: "gallons" },
  { canonical: "ml", dimension: "volume", base: 1, system: "metric", aliases: ["milliliter", "milliliters", "millilitre", "millilitres", "cc"] },
  { canonical: "l", dimension: "volume", base: 1000, system: "metric", aliases: ["liter", "liters", "litre", "litres"] },
  { canonical: "oz", dimension: "mass", base: 28.3495, system: "us", aliases: ["ounce", "ounces"] },
  { canonical: "lb", dimension: "mass", base: 453.592, system: "us", aliases: ["pound", "pounds", "lbs"], plural: "lb" },
  { canonical: "g", dimension: "mass", base: 1, system: "metric", aliases: ["gram", "grams", "gramme", "grammes"] },
  { canonical: "kg", dimension: "mass", base: 1000, system: "metric", aliases: ["kilogram", "kilograms", "kilo", "kilos"] },
];

const UNIT_INDEX = new Map<string, UnitDef>();
for (const def of UNIT_DEFS) {
  UNIT_INDEX.set(def.canonical.toLowerCase(), def);
  for (const alias of def.aliases) UNIT_INDEX.set(alias.toLowerCase(), def);
}

/** Resolve a free-text unit ("Tablespoons", "g") to its canonical form. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return UNIT_INDEX.get(key)?.canonical ?? raw.trim();
}

export function unitDimension(raw: string | null | undefined): Dimension | null {
  if (!raw) return null;
  return UNIT_INDEX.get(raw.trim().toLowerCase())?.dimension ?? null;
}

/** Convert a quantity between two compatible units; null if not convertible. */
export function convertUnit(
  quantity: number,
  from: string,
  to: string,
): number | null {
  const a = UNIT_INDEX.get(from.trim().toLowerCase());
  const b = UNIT_INDEX.get(to.trim().toLowerCase());
  if (!a || !b) return null;
  if (a.dimension !== b.dimension) return null;
  return roundNice((quantity * a.base) / b.base);
}

const VOLUME_LADDER_US = ["tsp", "tbsp", "cup", "quart", "gallon"];
const VOLUME_LADDER_METRIC = ["ml", "l"];
const MASS_LADDER_US = ["oz", "lb"];
const MASS_LADDER_METRIC = ["g", "kg"];

function ladderFor(dimension: Dimension, system: "us" | "metric"): string[] {
  if (dimension === "volume")
    return system === "us" ? VOLUME_LADDER_US : VOLUME_LADDER_METRIC;
  if (dimension === "mass")
    return system === "us" ? MASS_LADDER_US : MASS_LADDER_METRIC;
  return [];
}

export type Measure = { quantity: number; unit: string };

/**
 * Re-express a measure in the target system, choosing the friendliest unit on
 * the ladder (e.g. 500 ml → "500 ml"; 2000 ml → "2 l"; 3 tsp → "1 tbsp").
 * Returns the input unchanged when it can't be converted (e.g. "pinch").
 */
export function toSystem(
  quantity: number,
  unit: string | null | undefined,
  system: "us" | "metric",
): Measure | null {
  const def = unit ? UNIT_INDEX.get(unit.trim().toLowerCase()) : null;
  if (!def || def.dimension === "count") {
    return unit ? { quantity: roundNice(quantity), unit } : null;
  }
  const ladder = ladderFor(def.dimension, system);
  if (ladder.length === 0) return { quantity: roundNice(quantity), unit: def.canonical };

  const baseAmount = quantity * def.base;
  let chosen = ladder[0]!;
  for (const candidate of ladder) {
    const cDef = UNIT_INDEX.get(candidate)!;
    if (baseAmount >= cDef.base * 0.999) chosen = candidate;
  }
  const chosenDef = UNIT_INDEX.get(chosen)!;
  return { quantity: roundNice(baseAmount / chosenDef.base), unit: chosen };
}

/** Scale a nullable quantity by a factor, preserving null. */
export function scaleQuantity(
  quantity: number | null | undefined,
  factor: number,
): number | null {
  if (quantity == null) return null;
  return roundNice(quantity * factor);
}

/** Pluralize a unit label for display given a quantity. */
export function displayUnit(
  unit: string | null | undefined,
  quantity: number | null | undefined,
): string {
  if (!unit) return "";
  const def = UNIT_INDEX.get(unit.trim().toLowerCase());
  if (def?.plural && quantity != null && quantity !== 1) return def.plural;
  return def?.canonical ?? unit;
}
