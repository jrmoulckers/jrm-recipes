/**
 * Ingredient quantity math: pretty fraction formatting, serving scaling, and
 * unit conversion. Pure and side-effect-free so it's shared by the editor, the
 * recipe view, and offline cook mode — and easy to unit-test. Decimal output is
 * locale-aware (separators + numbering system); an optional `locale` argument
 * defaults to {@link DEFAULT_LOCALE} so existing callers are unaffected.
 */

import { DEFAULT_LOCALE } from "~/config/i18n";

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
 * Map an app locale id to a BCP-47 tag suitable for `Intl` number formatting.
 * Current CLDR resolves a region-less `ar` to Western ("latn") digits, but
 * Heirloom's Arabic UI expects Arabic-Indic numerals, so pin the numbering
 * system for the bare `ar` id. Every other locale (including region- or
 * numbering-qualified Arabic like `ar-EG`) passes through unchanged.
 */
function numberingLocale(locale: string): string {
  return locale === "ar" ? "ar-u-nu-arab" : locale;
}

/**
 * Render a number with the active locale's decimal separator and numbering
 * system (e.g. `1.5` → "1,5" in de-DE, Arabic-Indic digits in ar). Grouping is
 * disabled so cooking quantities never gain a thousands separator. Values are
 * pre-rounded by the callers, so three fraction digits is a safe ceiling.
 */
function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(numberingLocale(locale), {
    useGrouping: false,
    maximumFractionDigits: 3,
  }).format(value);
}

/**
 * Format a number the way a recipe would: whole numbers plainly, common
 * fractions as vulgar glyphs (1.5 → "1½"), everything else to 2 decimals.
 *
 * Pass the ingredient's `unit` so metric weights/volumes (g, ml, kg, l) are
 * rendered as plain decimals at a measurable precision instead of vulgar
 * fractions — a cook can't measure "⅓ g" or "½ ml". Omitting `unit` keeps the
 * imperial/fraction behavior, so existing callers are unaffected.
 *
 * Decimal and whole-number output is rendered through the active `locale`'s
 * number formatter; the vulgar-fraction glyphs themselves stay locale-invariant.
 */
export function formatQuantity(
  value: number | null | undefined,
  unit?: string | null,
  locale: string = DEFAULT_LOCALE,
): string {
  if (value == null || Number.isNaN(value)) return "";
  if (isMetricUnit(unit) || unitDimension(unit) === "temperature")
    return formatMetricQuantity(value, locale);
  const n = roundNice(value);
  if (n === 0) return formatDecimal(0, locale);
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) return formatDecimal(whole, locale);

  let best: { glyph: string; diff: number } | null = null;
  for (const [f, glyph] of VULGAR) {
    const diff = Math.abs(frac - f);
    if (diff < 0.03 && (!best || diff < best.diff)) best = { glyph, diff };
  }
  if (best) {
    return whole > 0
      ? `${formatDecimal(whole, locale)}${best.glyph}`
      : best.glyph;
  }

  const rounded = Math.round(n * 100) / 100;
  return formatDecimal(rounded, locale);
}

/**
 * The magnitude at or above which a metric amount is rendered as a whole
 * number. Below it — the small doses where a tenth of a gram is a real
 * measurement (yeast, salt, baking soda, spices, #403) — a single decimal
 * place is kept so scaling "12.5 g" shows "12.5", not a rounded "13".
 */
const METRIC_WHOLE_THRESHOLD = 50;

/**
 * Round a metric quantity to a precision a cook can actually measure and render
 * it as a locale-aware decimal (never a vulgar fraction). Large amounts (≥
 * {@link METRIC_WHOLE_THRESHOLD}, e.g. 500 g flour) stay clean whole numbers;
 * small doses keep one decimal place so measurable precision isn't rounded away
 * (#403). A value that lands on a whole number renders without a trailing `.0`.
 */
export function formatMetricQuantity(
  value: number,
  locale: string = DEFAULT_LOCALE,
): string {
  const n = roundNice(value);
  if (n === 0) return formatDecimal(0, locale);
  const rounded =
    Math.abs(n) >= METRIC_WHOLE_THRESHOLD
      ? Math.round(n)
      : Math.round(n * 10) / 10;
  return formatDecimal(rounded, locale);
}

// --- Units --------------------------------------------------------------

export type Dimension = "volume" | "mass" | "count" | "temperature";

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
  // Temperature is affine (offset + scale), so `base` is unused — conversion
  // goes through convertTemperature. The bare "c" alias is intentionally
  // omitted: it already means "cup", and a recipe's "2 c" is far more likely
  // cups than Celsius. Callers wanting Celsius should use "°C"/"celsius".
  { canonical: "°F", dimension: "temperature", base: 1, system: "us", aliases: ["f", "fahrenheit"] },
  { canonical: "°C", dimension: "temperature", base: 1, system: "metric", aliases: ["celsius", "centigrade"] },
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

/** True when the unit is a metric weight/volume (g, kg, ml, l, and aliases). */
function isMetricUnit(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return UNIT_INDEX.get(raw.trim().toLowerCase())?.system === "metric";
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
  if (a.dimension === "temperature")
    return convertTemperature(quantity, a.canonical, b.canonical);
  return roundNice((quantity * a.base) / b.base);
}

/**
 * Convert an affine temperature between °F and °C. Unlike mass/volume (a simple
 * base-ratio), temperature carries an offset, so it needs its own path. Results
 * are rounded to whole degrees — the precision recipes and ovens actually use.
 * Returns null unless both units are temperatures.
 */
export function convertTemperature(
  value: number,
  from: string,
  to: string,
): number | null {
  const a = UNIT_INDEX.get(from.trim().toLowerCase());
  const b = UNIT_INDEX.get(to.trim().toLowerCase());
  if (!a || !b) return null;
  if (a.dimension !== "temperature" || b.dimension !== "temperature") return null;
  if (a.canonical === b.canonical) return Math.round(value);
  const celsius = a.canonical === "°F" ? ((value - 32) * 5) / 9 : value;
  const result = b.canonical === "°F" ? (celsius * 9) / 5 + 32 : celsius;
  return Math.round(result);
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
  if (def.dimension === "temperature") {
    const target = system === "us" ? "°F" : "°C";
    const converted = convertTemperature(quantity, def.canonical, target);
    return converted == null
      ? { quantity: roundNice(quantity), unit: def.canonical }
      : { quantity: converted, unit: target };
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

export type MeasureRange = {
  quantity: number;
  quantityMax: number | null;
  unit: string;
};

/**
 * Re-express a *ranged* measure (min…max) in the target system. Both ends are
 * converted onto a single shared unit — the friendly unit chosen for the low
 * end — so a range can never mix units (e.g. showing a litre-scaled max value
 * next to a millilitre label). Returns null when there is no convertible unit;
 * `quantityMax` is null when there is no real range (missing or ≤ min).
 */
export function toSystemRange(
  min: number,
  max: number | null | undefined,
  unit: string | null | undefined,
  system: "us" | "metric",
): MeasureRange | null {
  const low = toSystem(min, unit, system);
  if (!low) return null;
  if (max == null || max <= min) {
    return { quantity: low.quantity, quantityMax: null, unit: low.unit };
  }
  const highInUnit = convertUnit(max, unit ?? low.unit, low.unit);
  const quantityMax = highInUnit ?? roundNice(max);
  return { quantity: low.quantity, quantityMax, unit: low.unit };
}

/** Scale a nullable quantity by a factor, preserving null. */
export function scaleQuantity(
  quantity: number | null | undefined,
  factor: number,
): number | null {
  if (quantity == null) return null;
  return roundNice(quantity * factor);
}

/**
 * Derive the scale factor that turns a recipe's base amount of one ingredient
 * into a target amount the cook actually has or needs (#390) — e.g. "500 g of
 * bananas" from a recipe that calls for 250 g gives ×2. The target may be given
 * in the ingredient's own unit or any convertible one (grams → the base's cups,
 * etc.). Returns `null` when either amount is missing / non-positive or the
 * units don't convert, so callers can fall back to servings scaling.
 */
export function deriveScaleFactor(
  baseQuantity: number | null | undefined,
  targetQuantity: number | null | undefined,
  baseUnit?: string | null,
  targetUnit?: string | null,
): number | null {
  if (
    baseQuantity == null ||
    !Number.isFinite(baseQuantity) ||
    baseQuantity <= 0 ||
    targetQuantity == null ||
    !Number.isFinite(targetQuantity) ||
    targetQuantity <= 0
  ) {
    return null;
  }
  let target = targetQuantity;
  const from = normalizeUnit(targetUnit);
  const to = normalizeUnit(baseUnit);
  if (from && to && from !== to) {
    const converted = convertUnit(targetQuantity, from, to);
    if (converted == null) return null;
    target = converted;
  }
  const factor = target / baseQuantity;
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

// --- Weigh-based cooking: volume → weight by density (#385) ---------------

/**
 * Approximate densities (grams per millilitre) for the staples a home baker
 * weighs most. Values are typical kitchen references — coverage matters more
 * than a perfect number, and any density beats guessing at a scooped cup. Each
 * entry lists normalized match phrases; the longest matching phrase wins so
 * "brown sugar" beats "sugar" and "bread flour" beats "flour".
 */
type DensityEntry = { gPerMl: number; phrases: string[] };

const INGREDIENT_DENSITIES: DensityEntry[] = [
  { gPerMl: 1.0, phrases: ["water"] },
  { gPerMl: 1.03, phrases: ["milk", "buttermilk"] },
  { gPerMl: 1.0, phrases: ["cream", "heavy cream", "sour cream"] },
  { gPerMl: 1.03, phrases: ["yogurt", "yoghurt"] },
  {
    gPerMl: 0.53,
    phrases: ["flour", "all purpose flour", "plain flour", "bread flour"],
  },
  { gPerMl: 0.55, phrases: ["whole wheat flour", "wholemeal flour"] },
  { gPerMl: 0.85, phrases: ["sugar", "granulated sugar", "caster sugar"] },
  { gPerMl: 0.9, phrases: ["brown sugar"] },
  {
    gPerMl: 0.5,
    phrases: ["powdered sugar", "confectioners sugar", "icing sugar"],
  },
  { gPerMl: 0.96, phrases: ["butter"] },
  { gPerMl: 0.92, phrases: ["oil", "olive oil", "vegetable oil", "canola oil"] },
  { gPerMl: 1.42, phrases: ["honey"] },
  { gPerMl: 1.37, phrases: ["maple syrup"] },
  { gPerMl: 0.45, phrases: ["cocoa", "cocoa powder"] },
  { gPerMl: 0.54, phrases: ["cornstarch", "corn starch", "cornflour"] },
  { gPerMl: 1.2, phrases: ["salt"] },
];

/**
 * Normalize an ingredient's free-text `item` into whole-word tokens for density
 * matching. Mirrors the tolerant normalizer in `substitutions.ts` (lowercase,
 * strip accents/parentheticals, keep the part before the first comma), but is
 * kept local so `units.ts` stays dependency-free (substitutions imports units).
 */
function densityTokens(item: string | null | undefined): string[] {
  if (!item) return [];
  let s = item.toLowerCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.split(",")[0] ?? s;
  s = s.replace(/[^a-z0-9]+/g, " ");
  return s.split(" ").filter(Boolean);
}

/** True when `phrase` appears as a contiguous run of whole words in `haystack`. */
function containsWholePhrase(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > haystack.length) return false;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    let matched = true;
    for (let j = 0; j < phrase.length; j++) {
      if (haystack[i + j] !== phrase[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

const DENSITY_INDEX = INGREDIENT_DENSITIES.flatMap((entry) =>
  entry.phrases.map((phrase) => ({
    gPerMl: entry.gPerMl,
    tokens: phrase.split(" "),
  })),
);

/**
 * Resolve an ingredient's density (grams per millilitre) from its `item` text,
 * or `null` when nothing in the static table matches. Prefers the most specific
 * (longest) phrase so "brown sugar" and "olive oil" beat "sugar" and "oil".
 */
export function densityForItem(item: string | null | undefined): number | null {
  const tokens = densityTokens(item);
  if (tokens.length === 0) return null;
  let best: { gPerMl: number; len: number } | null = null;
  for (const { gPerMl, tokens: phrase } of DENSITY_INDEX) {
    if (!containsWholePhrase(tokens, phrase)) continue;
    if (!best || phrase.length > best.len) best = { gPerMl, len: phrase.length };
  }
  return best ? best.gPerMl : null;
}

/**
 * Convert a measured ingredient amount to grams so a cook can weigh straight
 * onto a scale (#385). Mass units convert directly; volume units resolve a
 * density from the `item` text and multiply. Returns `null` — meaning "render
 * unchanged" — for count/unitless amounts ("1 egg", "pinch"), temperatures, or
 * a volume whose ingredient has no known density (so callers never show "NaN g").
 */
export function toWeight(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  item: string | null | undefined,
): number | null {
  if (quantity == null || Number.isNaN(quantity)) return null;
  const def = unit ? UNIT_INDEX.get(unit.trim().toLowerCase()) : null;
  if (!def) return null;
  if (def.dimension === "mass") {
    // `base` is grams for mass units, so this also converts oz/lb/kg → g.
    return roundNice(quantity * def.base);
  }
  if (def.dimension === "volume") {
    const density = densityForItem(item);
    if (density == null) return null;
    // `base` is millilitres for volume units.
    return roundNice(quantity * def.base * density);
  }
  return null;
}

/**
 * The CLDR plural category (`one`, `few`, `other`, …) for a count in a locale,
 * via `Intl.PluralRules`. Used to pick the right spelled-out unit label instead
 * of a hand-rolled `count !== 1` check, which is wrong for the many languages
 * with more than two plural forms.
 */
function pluralCategory(count: number, locale: string): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return new Intl.PluralRules(DEFAULT_LOCALE).select(count);
  }
}

/**
 * Pluralize a spelled-out unit label for display, choosing the form by the
 * active locale's plural rules. Unit *symbols* (g, ml, kg, tsp) have no spelled
 * plural and are returned invariant; only labels with a configured `plural`
 * (cups, pints, quarts, gallons) inflect. With just singular/plural English
 * forms available we treat the `one` category as singular and every other
 * category as plural.
 */
export function displayUnit(
  unit: string | null | undefined,
  quantity: number | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!unit) return "";
  const def = UNIT_INDEX.get(unit.trim().toLowerCase());
  if (
    def?.plural &&
    quantity != null &&
    pluralCategory(quantity, locale) !== "one"
  ) {
    return def.plural;
  }
  return def?.canonical ?? unit;
}

// --- Practical measure decomposition (#391) ------------------------------

/**
 * Break an awkward US-volume amount into a minimal set of measures a cook
 * actually owns — whole cups, whole tablespoons, and a rounded teaspoon — e.g.
 * "1 tbsp + 1 tsp" for 1.37 tbsp or "6 tbsp + 2 tsp" for 0.42 cup. Returns
 * `null` for non-US-volume units (metric/weight stay clean decimals) and for
 * amounts that already land on a single clean measure (½ cup, 2 tbsp), so the
 * hint only appears when it adds value. Pure and offline-safe.
 */
export function decomposeMeasure(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const def = unit ? UNIT_INDEX.get(unit.trim().toLowerCase()) : null;
  if (!def || def.dimension !== "volume" || def.system !== "us") return null;

  const tspBase = UNIT_INDEX.get("tsp")!.base;
  // Snap to the nearest measuring-spoon quarter-teaspoon up front so float dust
  // (a "clean" 2 cups arriving as 95.999… tsp) can't leak an extra measure.
  let remaining = Math.round(((quantity * def.base) / tspBase) * 4) / 4;

  const cups = Math.floor(remaining / 48 + 1e-9);
  remaining -= cups * 48;
  let tbsp = Math.floor(remaining / 3 + 1e-9);
  remaining -= tbsp * 3;
  let tsp = remaining;
  if (tsp >= 3) {
    tbsp += 1;
    tsp -= 3;
  }

  const parts: string[] = [];
  if (cups >= 1) {
    parts.push(`${formatDecimal(cups, locale)} ${displayUnit("cup", cups, locale)}`);
  }
  if (tbsp >= 1) parts.push(`${formatDecimal(tbsp, locale)} tbsp`);
  if (tsp > 0) parts.push(`${formatQuantity(tsp, undefined, locale)} tsp`);

  // Only worth showing when it decomposes into more than one practical measure.
  return parts.length >= 2 ? parts.join(" + ") : null;
}
// A display layer only: spoken-style fraction words + spelled-out units for
// Kids mode. It reuses the same scaled/measured values as the compact display
// (no new math), and non-Kids modes never call it, so their output is unchanged.

type KidFractionWords = {
  /** After a whole number: "1 and {combined}" → "1 and a half". */
  combined: string;
  /** Fraction-only, with a unit following: "{withUnit} cup" → "half a cup". */
  withUnit: string;
  /** Fraction-only, no unit (a bare count): "{bare} onion" → "half onion". */
  bare: string;
};

const KID_FRACTIONS: Array<[number, KidFractionWords]> = [
  [1 / 8, { combined: "an eighth", withUnit: "an eighth of a", bare: "an eighth" }],
  [1 / 6, { combined: "a sixth", withUnit: "a sixth of a", bare: "a sixth" }],
  [1 / 4, { combined: "a quarter", withUnit: "a quarter of a", bare: "a quarter" }],
  [1 / 3, { combined: "a third", withUnit: "a third of a", bare: "a third" }],
  [3 / 8, { combined: "three-eighths", withUnit: "three-eighths of a", bare: "three-eighths" }],
  [1 / 2, { combined: "a half", withUnit: "half a", bare: "half" }],
  [5 / 8, { combined: "five-eighths", withUnit: "five-eighths of a", bare: "five-eighths" }],
  [2 / 3, { combined: "two-thirds", withUnit: "two-thirds of a", bare: "two-thirds" }],
  [3 / 4, { combined: "three-quarters", withUnit: "three-quarters of a", bare: "three-quarters" }],
  [5 / 6, { combined: "five-sixths", withUnit: "five-sixths of a", bare: "five-sixths" }],
  [7 / 8, { combined: "seven-eighths", withUnit: "seven-eighths of a", bare: "seven-eighths" }],
];

/** Canonical unit → [singular, plural] spoken word. */
const KID_UNIT_WORDS: Record<string, [string, string]> = {
  tsp: ["teaspoon", "teaspoons"],
  tbsp: ["tablespoon", "tablespoons"],
  "fl oz": ["fluid ounce", "fluid ounces"],
  cup: ["cup", "cups"],
  pint: ["pint", "pints"],
  quart: ["quart", "quarts"],
  gallon: ["gallon", "gallons"],
  ml: ["milliliter", "milliliters"],
  l: ["liter", "liters"],
  oz: ["ounce", "ounces"],
  lb: ["pound", "pounds"],
  g: ["gram", "grams"],
  kg: ["kilogram", "kilograms"],
  "°F": ["degree", "degrees"],
  "°C": ["degree", "degrees"],
};

/**
 * Spell out a unit abbreviation for young cooks ("tbsp" → "tablespoons"),
 * pluralized by quantity (plural when > 1). Unknown units degrade gracefully to
 * the standard {@link displayUnit} output.
 */
export function expandKidUnit(
  unit: string | null | undefined,
  quantity: number | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!unit) return "";
  const def = UNIT_INDEX.get(unit.trim().toLowerCase());
  const canonical = def?.canonical ?? unit;
  const words = KID_UNIT_WORDS[canonical];
  if (!words) return displayUnit(unit, quantity, locale);
  const plural = quantity != null && quantity > 1;
  return plural ? words[1] : words[0];
}

/**
 * Kid-friendly rendering of a single measured amount: spoken fraction words and
 * a spelled-out unit ("¾ cup" → "three-quarters of a cup", "1½ tbsp" → "1 and a
 * half tablespoons"). Returns the same `{ number, unit }` shape as the compact
 * path so callers can slot it straight in. Metric weights/volumes and odd
 * decimals keep the precise compact number (with the unit still spelled out).
 */
export function formatKidAmount(
  value: number | null | undefined,
  unit?: string | null,
  locale: string = DEFAULT_LOCALE,
): { number: string; unit: string } {
  if (value == null || Number.isNaN(value)) {
    return { number: "", unit: expandKidUnit(unit, null, locale) };
  }
  const unitWord = expandKidUnit(unit, value, locale);

  // Metric weights/volumes + temperature: keep the precise decimal.
  if (isMetricUnit(unit) || unitDimension(unit) === "temperature") {
    return { number: formatQuantity(value, unit, locale), unit: unitWord };
  }

  const n = roundNice(value);
  if (n === 0) return { number: formatDecimal(0, locale), unit: unitWord };
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) {
    return { number: formatDecimal(whole, locale), unit: unitWord };
  }

  let best: { words: KidFractionWords; diff: number } | null = null;
  for (const [f, words] of KID_FRACTIONS) {
    const diff = Math.abs(frac - f);
    if (diff < 0.03 && (!best || diff < best.diff)) best = { words, diff };
  }
  if (best) {
    if (whole > 0) {
      return {
        number: `${formatDecimal(whole, locale)} and ${best.words.combined}`,
        unit: unitWord,
      };
    }
    return {
      number: unit ? best.words.withUnit : best.words.bare,
      unit: unitWord,
    };
  }

  // Odd decimal (e.g. 0.9): fall back to the compact number, unit still spelled.
  return { number: formatQuantity(value, unit, locale), unit: unitWord };
}

/** Regions that still cook in US customary / imperial units. */
const US_CUSTOMARY_REGIONS = new Set(["US", "LR", "MM"]);

/**
 * The measurement system a locale most likely expects, used as cook mode's
 * initial default before the cook makes (and stores) an explicit choice. The US
 * and the few US-adjacent imperial regions map to `"us"`; everyone else maps to
 * `"metric"`. The locale is maximized first, so a region-less id like `en`
 * resolves to its likely region (`en` → US → `"us"`, `de` → DE → `"metric"`).
 */
export function defaultSystemForLocale(locale: string): "us" | "metric" {
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).maximize().region ?? undefined;
  } catch {
    region = undefined;
  }
  return region && US_CUSTOMARY_REGIONS.has(region) ? "us" : "metric";
}
