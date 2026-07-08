import { scaleQuantity, toWeight } from "~/lib/units";

/**
 * Baker's percentages and batch-weight math (#384, #418). Everything here is
 * pure and offline-safe: it takes plain ingredient rows plus a scale factor and
 * derives gram weights via {@link toWeight} (mass units directly, volumes by
 * density), then reasons about flour, hydration, total batch weight, and
 * per-piece portioning. Recipes without derivable weights simply yield `null`
 * so the UI can hide the feature instead of rendering a broken view.
 */

export type WeighedIngredient = {
  item: string;
  quantity: number | null;
  unit: string | null;
};

/** Lowercase whole-word tokens for phrase matching (accent/punctuation-safe). */
function tokenize(item: string | null | undefined): string[] {
  if (!item) return [];
  let s = item.toLowerCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.split(",")[0] ?? s;
  s = s.replace(/[^a-z0-9]+/g, " ");
  return s.split(" ").filter(Boolean);
}

function hasWord(tokens: string[], word: string): boolean {
  return tokens.includes(word);
}

// Flours form the 100% base of a baker's formula. Match on the word "flour"
// plus the common milled staples bakers weigh as flour.
const FLOUR_WORDS = [
  "flour",
  "semolina",
  "cornmeal",
  "polenta",
];

/** True when an ingredient counts toward the total-flour (100%) base. */
export function isFlour(item: string | null | undefined): boolean {
  const tokens = tokenize(item);
  return FLOUR_WORDS.some((w) => hasWord(tokens, w));
}

// Liquids used for the hydration ratio (liquid weight ÷ flour weight).
const LIQUID_WORDS = [
  "water",
  "milk",
  "buttermilk",
  "cream",
  "yogurt",
  "yoghurt",
  "juice",
  "coffee",
  "beer",
  "wine",
  "stock",
  "broth",
  "kefir",
  "whey",
];

/** True when an ingredient counts as liquid for hydration. */
export function isLiquid(item: string | null | undefined): boolean {
  const tokens = tokenize(item);
  return LIQUID_WORDS.some((w) => hasWord(tokens, w));
}

export type BakersLine = {
  item: string;
  grams: number;
  /** Weight as a percentage of total flour (flour lines sum toward 100%). */
  percent: number;
  flour: boolean;
};

export type BakersFormula = {
  lines: BakersLine[];
  totalFlour: number;
  totalWeight: number;
  /** Liquid weight ÷ flour weight, as a percentage; `null` when no liquid. */
  hydration: number | null;
};

/**
 * Compute a baker's-percentage formula from ingredient rows scaled by `factor`.
 * Returns `null` when no flour weight is derivable (a non-bakeable recipe), so
 * the caller can hide the toggle rather than divide by zero.
 */
export function computeBakersFormula(
  ingredients: WeighedIngredient[],
  factor = 1,
): BakersFormula | null {
  const weighed: Array<{ item: string; grams: number; flour: boolean }> = [];
  let totalFlour = 0;
  let totalLiquid = 0;
  let totalWeight = 0;

  for (const ing of ingredients) {
    const scaled = scaleQuantity(ing.quantity, factor);
    const grams = toWeight(scaled, ing.unit, ing.item);
    if (grams == null || grams <= 0) continue;
    const flour = isFlour(ing.item);
    weighed.push({ item: ing.item, grams, flour });
    totalWeight += grams;
    if (flour) totalFlour += grams;
    else if (isLiquid(ing.item)) totalLiquid += grams;
  }

  if (totalFlour <= 0) return null;

  const lines: BakersLine[] = weighed.map((w) => ({
    item: w.item,
    grams: w.grams,
    percent: (w.grams / totalFlour) * 100,
    flour: w.flour,
  }));

  return {
    lines,
    totalFlour,
    totalWeight,
    hydration: totalLiquid > 0 ? (totalLiquid / totalFlour) * 100 : null,
  };
}
