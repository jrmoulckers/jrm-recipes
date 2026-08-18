/**
 * Household-measure → grams per canonical food (issue #1025, ADR-0006).
 *
 * This module closes the **count → mass gap**. `units.ts` can convert a mass
 * unit to grams directly and a volume unit to grams via `densityGPerMl`, but the
 * `count` dimension has no arithmetic path at all: there is no universal number
 * of grams in "1 onion". It is a property of the *food*, not of the unit.
 *
 * That gap was not academic. `food-units.ts` suggests `each` as the **default**
 * unit for whole produce, fruit, and eggs, so the recipe editor actively steers
 * cooks toward units the nutrition roll-up then silently dropped. Only 58 of the
 * 137 curated foods carry a density, so a further slice of `cup`/`tbsp` lines
 * (every fresh herb, most spices, cheese, dry pasta) fell through the same hole.
 *
 * A portion is the missing edge. Each row says "one `unit` of this food weighs
 * `gramsPerUnit` grams", which resolves `2 eggs`, `3 cloves garlic`, and
 * `1 bunch parsley` to real weights, and *also* rescues the density-less volume
 * lines, because `1 cup shredded cheese` is a measured portion rather than a
 * computed one.
 *
 * Values are the generic USDA FoodData Central `food_portion` gram weights
 * (public domain, CC0 1.0) — the same dataset already cited in
 * `food_nutrition.sourceRef` — rounded to kitchen precision, with a small set of
 * `kitchen` rows for informal measures FDC does not model (`pinch`, `sprig`).
 * Coverage matters more than three-decimal precision: an onion that is 15% off
 * is enormously better than an onion counted as zero.
 *
 * Like `food-db.ts` and `food-nutrition.ts`, this module is pure and
 * dependency-free (no `units.ts`, no `db`, no `server-only`), so it stays
 * client-safe, offline, and trivially unit-testable. The `food_portions` Drizzle
 * table mirrors it and is seeded from it; this module is the source of truth.
 * The resolver that *consumes* these rows lives in `food-grams.ts`, which is
 * where the units library is allowed to be imported.
 */
import { canonicalFood, foodSlug } from './food-db';

/**
 * Where a portion weight came from. `usda` rows are generic FoodData Central
 * `food_portion` gram weights. `kitchen` rows are conventional cooking
 * references for informal measures FDC does not publish (a `pinch`, a `sprig`),
 * and are held to the same "honest approximation" bar.
 */
export type PortionSource = 'usda' | 'kitchen';

/** One household measure of a food, and what it weighs. */
export type FoodPortion = {
  /**
   * The unit token this portion resolves. Matches the informal count tokens in
   * `food-units.ts` (`each`, `clove`, `bunch`, `sprig`, `pinch`, `can`) or a
   * canonical `units.ts` volume token (`cup`, `tbsp`, `tsp`) for foods that
   * have no density.
   */
  unit: string;
  /** Grams in exactly one of `unit`. Always > 0. */
  gramsPerUnit: number;
  /**
   * What "one" means, when the bare unit is ambiguous — "medium", "head",
   * "drained". Display/provenance only; it never takes part in matching.
   */
  modifier?: string;
  source: PortionSource;
};

type PortionSeed = { name: string; portions: FoodPortion[] };

const usda = (unit: string, gramsPerUnit: number, modifier?: string): FoodPortion => ({
  unit,
  gramsPerUnit,
  ...(modifier ? { modifier } : {}),
  source: 'usda',
});

const kitchen = (unit: string, gramsPerUnit: number, modifier?: string): FoodPortion => ({
  unit,
  gramsPerUnit,
  ...(modifier ? { modifier } : {}),
  source: 'kitchen',
});

/**
 * The curated portion table. `name` must match a canonical food in `food-db.ts`
 * so both key onto the same node via {@link foodSlug}; a dev-time guard below
 * fails loudly on drift. Ordered by category for readability — lookup is by
 * slug and order-independent.
 *
 * Only foods that actually need a portion appear here. A food measured purely
 * by mass (meat, which `food-units.ts` suggests in `lb`/`oz`/`g`) already has an
 * exact arithmetic path and is deliberately absent.
 */
const PORTION_SEEDS: PortionSeed[] = [
  // --- Whole produce: the `each` default the editor suggests ---------------
  { name: 'Onion', portions: [usda('each', 110, 'medium'), usda('cup', 160, 'chopped')] },
  {
    name: 'Garlic',
    // Recipes overwhelmingly mean a clove, so a bare `each` resolves to one.
    // A whole head is available under its own explicit token.
    portions: [
      usda('clove', 3),
      usda('each', 3, 'clove'),
      usda('head', 40),
      usda('tsp', 2.8, 'minced'),
    ],
  },
  { name: 'Shallot', portions: [usda('each', 40), usda('cup', 160, 'chopped')] },
  { name: 'Potato', portions: [usda('each', 173, 'medium'), usda('cup', 150, 'diced')] },
  { name: 'Sweet potato', portions: [usda('each', 130, 'medium'), usda('cup', 133, 'cubed')] },
  { name: 'Carrot', portions: [usda('each', 61, 'medium'), usda('cup', 128, 'chopped')] },
  { name: 'Tomato', portions: [usda('each', 123, 'medium'), usda('cup', 180, 'chopped')] },
  { name: 'Bell pepper', portions: [usda('each', 119, 'medium'), usda('cup', 149, 'chopped')] },
  { name: 'Cucumber', portions: [usda('each', 301), usda('cup', 133, 'sliced')] },
  { name: 'Zucchini', portions: [usda('each', 196, 'medium'), usda('cup', 124, 'sliced')] },
  { name: 'Eggplant', portions: [usda('each', 458), usda('cup', 82, 'cubed')] },
  { name: 'Avocado', portions: [usda('each', 150), usda('cup', 146, 'cubed')] },
  { name: 'Mushroom', portions: [usda('each', 18), usda('cup', 70, 'sliced')] },
  {
    name: 'Celery',
    portions: [usda('each', 40, 'stalk'), usda('stalk', 40), usda('cup', 101, 'chopped')],
  },
  { name: 'Corn', portions: [usda('each', 90, 'ear, kernels'), usda('ear', 90), usda('cup', 145)] },
  {
    name: 'Broccoli',
    portions: [usda('each', 548, 'head'), usda('head', 548), usda('cup', 91, 'chopped')],
  },
  {
    name: 'Cauliflower',
    portions: [usda('each', 588, 'head'), usda('head', 588), usda('cup', 107, 'chopped')],
  },
  { name: 'Squash', portions: [usda('each', 200), usda('cup', 116, 'cubed')] },
  { name: 'Leek', portions: [usda('each', 89), usda('cup', 89, 'chopped')] },
  {
    name: 'Ginger',
    portions: [kitchen('each', 30, 'thumb-sized piece'), usda('tsp', 2, 'grated')],
  },

  // --- Fruit ---------------------------------------------------------------
  { name: 'Apple', portions: [usda('each', 182, 'medium'), usda('cup', 125, 'chopped')] },
  { name: 'Banana', portions: [usda('each', 118, 'medium'), usda('cup', 150, 'sliced')] },
  { name: 'Lemon', portions: [usda('each', 58), usda('tbsp', 15, 'juice')] },
  { name: 'Lime', portions: [usda('each', 67), usda('tbsp', 15, 'juice')] },
  { name: 'Orange', portions: [usda('each', 131), usda('cup', 180, 'sections')] },
  { name: 'Mango', portions: [usda('each', 336), usda('cup', 165, 'diced')] },
  { name: 'Pineapple', portions: [usda('each', 905), usda('cup', 165, 'chunks')] },
  { name: 'Peach', portions: [usda('each', 150, 'medium'), usda('cup', 154, 'sliced')] },
  { name: 'Berries', portions: [usda('cup', 144), usda('each', 5)] },
  { name: 'Grapes', portions: [usda('cup', 151), usda('each', 5)] },
  { name: 'Raisins', portions: [usda('cup', 165), usda('tbsp', 10)] },

  // --- Leafy produce: sold by the bunch, measured by the cup ---------------
  { name: 'Spinach', portions: [usda('cup', 30), usda('bunch', 340)] },
  {
    name: 'Lettuce',
    portions: [usda('cup', 47, 'shredded'), usda('each', 300, 'head'), usda('head', 300)],
  },
  { name: 'Kale', portions: [usda('cup', 21, 'chopped'), usda('bunch', 200)] },
  {
    name: 'Cabbage',
    portions: [usda('cup', 89, 'shredded'), usda('each', 908, 'head'), usda('head', 908)],
  },
  { name: 'Arugula', portions: [usda('cup', 20), usda('bunch', 100)] },
  { name: 'Chard', portions: [usda('cup', 36, 'chopped'), usda('bunch', 200)] },
  { name: 'Salad greens', portions: [usda('cup', 20), usda('bunch', 100)] },

  // --- Fresh herbs: no density, so every suggested unit needs a portion ----
  {
    name: 'Basil',
    portions: [
      usda('tbsp', 2.6, 'chopped'),
      usda('tsp', 0.9),
      usda('cup', 24),
      kitchen('sprig', 0.5),
      kitchen('bunch', 40),
    ],
  },
  {
    name: 'Parsley',
    portions: [
      usda('tbsp', 3.8, 'chopped'),
      usda('tsp', 1.3),
      usda('cup', 60),
      kitchen('sprig', 1),
      kitchen('bunch', 60),
    ],
  },
  {
    name: 'Cilantro',
    portions: [
      usda('tbsp', 1, 'chopped'),
      usda('tsp', 0.3),
      usda('cup', 16),
      kitchen('sprig', 0.5),
      kitchen('bunch', 45),
    ],
  },
  {
    name: 'Mint',
    portions: [
      usda('tbsp', 1.9, 'chopped'),
      usda('tsp', 0.6),
      usda('cup', 30),
      kitchen('sprig', 0.5),
      kitchen('bunch', 30),
    ],
  },
  {
    name: 'Thyme',
    portions: [usda('tsp', 0.8), usda('tbsp', 2.4), kitchen('sprig', 0.3), kitchen('bunch', 25)],
  },
  {
    name: 'Rosemary',
    portions: [usda('tsp', 1.2), usda('tbsp', 3.3), kitchen('sprig', 1), kitchen('bunch', 25)],
  },
  {
    name: 'Oregano',
    portions: [usda('tsp', 1), usda('tbsp', 3), kitchen('sprig', 0.5), kitchen('bunch', 25)],
  },
  {
    name: 'Dill',
    portions: [
      usda('tbsp', 3, 'chopped'),
      usda('tsp', 1),
      usda('cup', 8.9),
      kitchen('sprig', 0.3),
      kitchen('bunch', 30),
    ],
  },
  {
    name: 'Sage',
    portions: [usda('tsp', 0.7), usda('tbsp', 2), kitchen('sprig', 0.5), kitchen('bunch', 20)],
  },
  { name: 'Chives', portions: [usda('tbsp', 3, 'chopped'), usda('tsp', 1), kitchen('bunch', 25)] },
  { name: 'Bay leaf', portions: [kitchen('each', 0.2), kitchen('leaf', 0.2)] },

  // --- Spices: tiny weights, but a `pinch` must not resolve to zero -------
  { name: 'Black pepper', portions: [usda('tsp', 2.3), usda('tbsp', 6.9), kitchen('pinch', 0.29)] },
  { name: 'Cinnamon', portions: [usda('tsp', 2.6), usda('tbsp', 7.8), kitchen('pinch', 0.33)] },
  { name: 'Cumin', portions: [usda('tsp', 2.1), usda('tbsp', 6), kitchen('pinch', 0.26)] },
  { name: 'Paprika', portions: [usda('tsp', 2.3), usda('tbsp', 6.8), kitchen('pinch', 0.29)] },
  { name: 'Chili powder', portions: [usda('tsp', 2.7), usda('tbsp', 8), kitchen('pinch', 0.34)] },
  { name: 'Turmeric', portions: [usda('tsp', 3), usda('tbsp', 9), kitchen('pinch', 0.38)] },
  { name: 'Nutmeg', portions: [usda('tsp', 2.2), usda('tbsp', 7), kitchen('pinch', 0.28)] },
  {
    name: 'Ground ginger',
    portions: [usda('tsp', 1.8), usda('tbsp', 5.4), kitchen('pinch', 0.23)],
  },
  { name: 'Curry powder', portions: [usda('tsp', 2), usda('tbsp', 6.3), kitchen('pinch', 0.25)] },
  {
    name: 'Garlic powder',
    portions: [usda('tsp', 3.1), usda('tbsp', 9.7), kitchen('pinch', 0.39)],
  },
  { name: 'Vanilla', portions: [usda('tsp', 4.2, 'extract'), usda('tbsp', 13)] },
  {
    name: 'Cloves',
    portions: [usda('tsp', 2.1, 'ground'), usda('tbsp', 6.6), kitchen('pinch', 0.26)],
  },
  {
    name: 'Ground coriander',
    portions: [usda('tsp', 1.8), usda('tbsp', 5), kitchen('pinch', 0.23)],
  },
  {
    name: 'Red pepper flakes',
    portions: [usda('tsp', 1.8), usda('tbsp', 5.3), kitchen('pinch', 0.23)],
  },
  { name: 'Salt', portions: [kitchen('pinch', 0.36)] },

  // --- Eggs: counted, and the whole egg has no density --------------------
  { name: 'Egg', portions: [usda('each', 50, 'large'), usda('cup', 243, 'beaten')] },
  { name: 'Egg white', portions: [usda('each', 33, 'large')] },
  { name: 'Egg yolk', portions: [usda('each', 17, 'large')] },

  // --- Dairy & dry goods with no density ----------------------------------
  {
    name: 'Cheese',
    portions: [usda('cup', 113, 'shredded'), usda('tbsp', 7), usda('tsp', 2.4), usda('slice', 21)],
  },
  { name: 'Pasta', portions: [usda('cup', 100, 'dry')] },

  // --- Legumes: the canned shortcut, counted as drained -------------------
  { name: 'Beans', portions: [usda('can', 254, 'drained')] },
  { name: 'Chickpeas', portions: [usda('can', 254, 'drained')] },

  // --- Seafood sold by the piece ------------------------------------------
  { name: 'Shrimp', portions: [usda('each', 7)] },
  { name: 'Scallops', portions: [usda('each', 15)] },
  { name: 'Mussels', portions: [usda('each', 8)] },
  { name: 'Fish', portions: [usda('each', 150, 'fillet'), usda('fillet', 150)] },
];

/** Normalize a unit token for matching: trimmed, lowercased, singularized. */
export function normalizePortionUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').trim().toLowerCase();
  if (!u) return '';
  // Portion tokens are stored singular. Fold the common plural the editor and
  // free-text import produce ("cloves", "sprigs", "slices") onto it.
  if (u.length > 3 && u.endsWith('es') && /(ch|sh|s|x|z)es$/.test(u)) return u.slice(0, -2);
  if (u.length > 2 && u.endsWith('s') && !u.endsWith('ss')) return u.slice(0, -1);
  return u;
}

/** slug → (normalized unit → portion). Built once at module load. */
const PORTIONS_BY_SLUG: ReadonlyMap<string, ReadonlyMap<string, FoodPortion>> = (() => {
  const out = new Map<string, Map<string, FoodPortion>>();
  for (const seed of PORTION_SEEDS) {
    const slug = foodSlug(seed.name);
    const byUnit = out.get(slug) ?? new Map<string, FoodPortion>();
    for (const portion of seed.portions) {
      byUnit.set(normalizePortionUnit(portion.unit), portion);
    }
    out.set(slug, byUnit);
  }
  return out;
})();

// Guard against drift: every seeded name must be a real canonical food, and
// every weight must be a positive, finite number. A typo here would silently
// strand a portion that no lookup could ever reach.
if (process.env.NODE_ENV !== 'production') {
  for (const seed of PORTION_SEEDS) {
    if (!canonicalFood(seed.name)) {
      throw new Error(`food-portions: "${seed.name}" is not a canonical food in food-db.ts`);
    }
    for (const p of seed.portions) {
      if (!Number.isFinite(p.gramsPerUnit) || p.gramsPerUnit <= 0) {
        throw new Error(`food-portions: "${seed.name}" has a non-positive weight for "${p.unit}"`);
      }
    }
  }
}

/** Every portion curated for a canonical food slug (empty when none). */
export function portionsForSlug(slug: string): readonly FoodPortion[] {
  const byUnit = PORTIONS_BY_SLUG.get(slug);
  return byUnit ? [...byUnit.values()] : [];
}

/**
 * The portion for a (food slug, unit) pair, or `null` when this food has no
 * curated weight for that unit. Unit matching is normalized, so `cloves`
 * resolves the `clove` row.
 */
export function portionForSlug(slug: string, unit: string | null | undefined): FoodPortion | null {
  return PORTIONS_BY_SLUG.get(slug)?.get(normalizePortionUnit(unit)) ?? null;
}

/**
 * The portion for a **free-text** ingredient and unit, resolved through the
 * canonical food matcher. `null` when the text matches no food, or the matched
 * food has no curated weight for that unit.
 */
export function portionForFood(
  item: string | null | undefined,
  unit: string | null | undefined,
): FoodPortion | null {
  const food = canonicalFood(item);
  return food ? portionForSlug(food.slug, unit) : null;
}

/** Every (slug, portion) pair, for the `food_portions` seeder. */
export function allPortions(): { slug: string; portion: FoodPortion }[] {
  const out: { slug: string; portion: FoodPortion }[] = [];
  for (const [slug, byUnit] of PORTIONS_BY_SLUG) {
    for (const portion of byUnit.values()) out.push({ slug, portion });
  }
  return out;
}
