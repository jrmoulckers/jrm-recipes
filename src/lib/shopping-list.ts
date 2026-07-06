/**
 * Shopping-list aggregation.
 *
 * Pure and dependency-free (beyond the unit math in `./units`) so it can run on
 * the server when persisting a list, in the browser for the offline zustand
 * fallback, and be unit-tested exhaustively. This is the heart of the feature:
 * given one or more recipes and a desired serving count per recipe, it scales
 * every ingredient, combines like items across recipes with unit-aware math,
 * and buckets the result into sensible grocery categories.
 */

import {
  convertUnit,
  displayUnit,
  formatQuantity,
  normalizeUnit,
  roundNice,
  scaleQuantity,
  toSystem,
  unitDimension,
  type Dimension,
} from "./units";

// --- Public types -------------------------------------------------------

/** A single ingredient contribution (from a recipe or a manual entry). */
export type ShoppingItemInput = {
  item: string;
  quantity?: number | null;
  quantityMax?: number | null;
  unit?: string | null;
  optional?: boolean | null;
  recipeId?: string | null;
};

/** A recipe plus the serving count the shopper wants to cook. */
export type ShoppingRecipeInput = {
  recipeId?: string | null;
  /** The recipe's own base serving count (what its quantities are written for). */
  servings?: number | null;
  /** How many servings the shopper wants; defaults to `servings`. */
  desiredServings?: number | null;
  ingredients: ShoppingItemInput[];
};

/** One consolidated line on the shopping list. */
export type AggregatedItem = {
  /** Stable dedupe / React key (normalized item + unit bucket). */
  key: string;
  item: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  dimension: Dimension | null;
  category: ShoppingCategory;
  /** True only when every contribution was marked optional. */
  optional: boolean;
  /** Recipe ids that contributed to this line (deduped, in first-seen order). */
  recipeIds: string[];
};

export type AggregatedGroup = {
  category: ShoppingCategory;
  items: AggregatedItem[];
};

export type ShoppingListResult = {
  items: AggregatedItem[];
  groups: AggregatedGroup[];
};

// --- Categories ---------------------------------------------------------

export const SHOPPING_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Spices & Seasonings",
  "Frozen",
  "Beverages",
  "Other",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

const CATEGORY_INDEX = new Map<ShoppingCategory, number>(
  SHOPPING_CATEGORIES.map((c, i) => [c, i]),
);

/**
 * Keyword rules, evaluated in order — the first category with a matching
 * keyword wins, so more specific aisles (Frozen, Spices) are checked before
 * broad ones (Pantry). Matching is a whole-word test so "corn" doesn't trip on
 * "cornstarch".
 */
const CATEGORY_RULES: { category: ShoppingCategory; keywords: string[] }[] = [
  {
    category: "Frozen",
    keywords: ["frozen", "ice cream", "popsicle"],
  },
  {
    category: "Beverages",
    keywords: [
      "wine",
      "beer",
      "juice",
      "coffee",
      "tea",
      "soda",
      "cola",
      "sparkling water",
      "seltzer",
      "broth",
      "stock",
    ],
  },
  {
    category: "Spices & Seasonings",
    keywords: [
      "salt",
      "pepper",
      "peppercorn",
      "cumin",
      "paprika",
      "cinnamon",
      "nutmeg",
      "oregano",
      "basil",
      "thyme",
      "rosemary",
      "parsley",
      "cilantro",
      "coriander",
      "turmeric",
      "curry",
      "chili powder",
      "cayenne",
      "clove",
      "cloves",
      "bay leaf",
      "bay leaves",
      "vanilla",
      "ginger",
      "garlic powder",
      "onion powder",
      "spice",
      "seasoning",
      "herb",
      "herbs",
    ],
  },
  {
    category: "Dairy & Eggs",
    keywords: [
      "milk",
      "cream",
      "butter",
      "cheese",
      "parmesan",
      "mozzarella",
      "cheddar",
      "yogurt",
      "yoghurt",
      "egg",
      "eggs",
      "sour cream",
      "buttermilk",
      "ricotta",
      "feta",
    ],
  },
  {
    category: "Meat & Seafood",
    keywords: [
      "chicken",
      "beef",
      "pork",
      "bacon",
      "sausage",
      "turkey",
      "lamb",
      "steak",
      "ground beef",
      "mince",
      "fish",
      "salmon",
      "tuna",
      "shrimp",
      "prawn",
      "crab",
      "cod",
      "ham",
      "meat",
    ],
  },
  {
    category: "Bakery",
    keywords: [
      "bread",
      "baguette",
      "bun",
      "buns",
      "roll",
      "rolls",
      "tortilla",
      "pita",
      "bagel",
      "croissant",
      "brioche",
    ],
  },
  {
    category: "Produce",
    keywords: [
      "onion",
      "garlic",
      "tomato",
      "potato",
      "carrot",
      "celery",
      "lettuce",
      "spinach",
      "kale",
      "pepper",
      "cucumber",
      "zucchini",
      "mushroom",
      "broccoli",
      "cauliflower",
      "cabbage",
      "corn",
      "peas",
      "bean",
      "beans",
      "apple",
      "banana",
      "lemon",
      "lime",
      "orange",
      "berry",
      "berries",
      "strawberry",
      "blueberry",
      "avocado",
      "lettuce",
      "scallion",
      "shallot",
      "leek",
      "eggplant",
      "squash",
      "fruit",
      "vegetable",
    ],
  },
  {
    category: "Pantry",
    keywords: [
      "flour",
      "sugar",
      "rice",
      "pasta",
      "noodle",
      "oil",
      "olive oil",
      "vinegar",
      "sauce",
      "soy sauce",
      "ketchup",
      "mustard",
      "mayonnaise",
      "honey",
      "syrup",
      "oats",
      "cereal",
      "baking soda",
      "baking powder",
      "yeast",
      "cornstarch",
      "cocoa",
      "chocolate",
      "canned",
      "can of",
      "tomato paste",
      "coconut milk",
      "lentil",
      "chickpea",
      "nut",
      "nuts",
      "almond",
      "walnut",
      "peanut",
      "raisin",
      "cracker",
      "breadcrumb",
      "stock cube",
      "bouillon",
      "water",
    ],
  },
];

/** Categorize a free-text ingredient name into a grocery aisle. */
export function categorize(item: string): ShoppingCategory {
  const name = ` ${item.toLowerCase().trim()} `;
  for (const { category, keywords } of CATEGORY_RULES) {
    for (const keyword of keywords) {
      if (name.includes(` ${keyword} `) || name.includes(` ${keyword}s `)) {
        return category;
      }
      // Substring fallback for multi-word / possessive forms.
      if (keyword.includes(" ") && name.includes(keyword)) return category;
    }
  }
  return "Other";
}

// --- Aggregation --------------------------------------------------------

/** Metric canonical units, used to pick a display system for a combined line. */
const METRIC_CANONICAL = new Set(["ml", "l", "g", "kg"]);

function baseUnitFor(dimension: Dimension): string {
  return dimension === "mass" ? "g" : "ml";
}

/** Serving scale factor; 1 when we lack the numbers to scale meaningfully. */
export function scaleFactor(
  baseServings: number | null | undefined,
  desiredServings: number | null | undefined,
): number {
  const base = baseServings ?? 0;
  const desired = desiredServings ?? base;
  if (base <= 0 || desired <= 0) return 1;
  return desired / base;
}

/** Collapse whitespace / casing so "Olive  Oil" and "olive oil" dedupe. */
export function normalizeItemName(item: string): string {
  return item.toLowerCase().trim().replace(/\s+/g, " ");
}

type Bucket = {
  /** Dedupe bucket: a dimension, `u:<unit>`, or `count`. */
  id: string;
  dimension: Dimension | null;
  /** Display unit for the bucket (canonical / normalized text, or null). */
  unit: string | null;
};

function bucketFor(rawUnit: string | null | undefined): Bucket {
  const unit = rawUnit?.trim();
  if (!unit) return { id: "count", dimension: null, unit: null };
  const dimension = unitDimension(unit);
  if (dimension) {
    return { id: dimension, dimension, unit: normalizeUnit(unit) };
  }
  const normalized = normalizeUnit(unit) ?? unit;
  return { id: `u:${normalized.toLowerCase()}`, dimension: null, unit: normalized };
}

type Accumulator = {
  key: string;
  item: string;
  dimension: Dimension | null;
  unit: string | null;
  min: number;
  max: number;
  hasQuantity: boolean;
  allOptional: boolean;
  recipeIds: string[];
  order: number;
};

/**
 * Merge raw ingredient contributions into consolidated, categorized line items.
 * Like items (same normalized name + compatible unit) are summed; convertible
 * units are combined via the unit ladder and re-expressed in a friendly unit.
 */
export function mergeShoppingItems(
  inputs: ShoppingItemInput[],
): AggregatedItem[] {
  const map = new Map<string, Accumulator>();

  for (const input of inputs) {
    const item = input.item?.trim();
    if (!item) continue;

    const bucket = bucketFor(input.unit);
    const key = `${normalizeItemName(item)}\u0000${bucket.id}`;

    let acc = map.get(key);
    if (!acc) {
      acc = {
        key,
        item,
        dimension: bucket.dimension,
        unit: bucket.unit,
        min: 0,
        max: 0,
        hasQuantity: false,
        allOptional: true,
        recipeIds: [],
        order: map.size,
      };
      map.set(key, acc);
    }

    const quantity = input.quantity ?? null;
    const quantityMax = input.quantityMax ?? quantity;

    if (quantity != null) {
      if (bucket.dimension) {
        const base = baseUnitFor(bucket.dimension);
        acc.min += convertUnit(quantity, input.unit ?? base, base) ?? 0;
        acc.max += convertUnit(quantityMax ?? quantity, input.unit ?? base, base) ?? 0;
      } else {
        acc.min += quantity;
        acc.max += quantityMax ?? quantity;
      }
      acc.hasQuantity = true;
    }

    if (!input.optional) acc.allOptional = false;
    if (input.recipeId && !acc.recipeIds.includes(input.recipeId)) {
      acc.recipeIds.push(input.recipeId);
    }
  }

  const items = [...map.values()].map(finalize);
  return sortItems(items);
}

function finalize(acc: Accumulator): AggregatedItem {
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit = acc.unit;

  if (acc.hasQuantity) {
    if (acc.dimension) {
      const base = baseUnitFor(acc.dimension);
      const system = acc.unit && METRIC_CANONICAL.has(acc.unit) ? "metric" : "us";
      const friendly = toSystem(acc.min, base, system);
      if (friendly) {
        quantity = friendly.quantity;
        unit = friendly.unit;
        quantityMax =
          acc.max > acc.min + 1e-6
            ? convertUnit(acc.max, base, friendly.unit)
            : null;
      } else {
        quantity = roundNice(acc.min);
      }
    } else {
      quantity = roundNice(acc.min);
      quantityMax = acc.max > acc.min + 1e-6 ? roundNice(acc.max) : null;
    }
  }

  return {
    key: acc.key,
    item: acc.item,
    quantity,
    quantityMax,
    unit,
    dimension: acc.dimension,
    category: categorize(acc.item),
    optional: acc.allOptional,
    recipeIds: acc.recipeIds,
  };
}

function sortItems(items: AggregatedItem[]): AggregatedItem[] {
  return [...items].sort((a, b) => {
    const byCategory =
      (CATEGORY_INDEX.get(a.category) ?? 99) -
      (CATEGORY_INDEX.get(b.category) ?? 99);
    if (byCategory !== 0) return byCategory;
    return a.item.localeCompare(b.item);
  });
}

/** Group a flat list of consolidated items by category (in display order). */
export function groupByCategory(items: AggregatedItem[]): AggregatedGroup[] {
  const groups = new Map<ShoppingCategory, AggregatedItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return SHOPPING_CATEGORIES.filter((c) => groups.has(c)).map((category) => ({
    category,
    items: groups.get(category)!,
  }));
}

/** Flatten recipes (scaling each) into individual contributions. */
export function toShoppingItems(
  recipe: ShoppingRecipeInput,
): ShoppingItemInput[] {
  const factor = scaleFactor(recipe.servings, recipe.desiredServings);
  return recipe.ingredients.map((ing) => ({
    item: ing.item,
    quantity: scaleQuantity(ing.quantity, factor),
    quantityMax: scaleQuantity(ing.quantityMax, factor),
    unit: ing.unit ?? null,
    optional: ing.optional ?? false,
    recipeId: recipe.recipeId ?? null,
  }));
}

/**
 * Build a consolidated shopping list from one or more recipes, each scaled to
 * its desired serving count. Returns both a flat, sorted item list and the same
 * items grouped by grocery category.
 */
export function aggregateShoppingList(
  recipes: ShoppingRecipeInput[],
): ShoppingListResult {
  const inputs = recipes.flatMap(toShoppingItems);
  const items = mergeShoppingItems(inputs);
  return { items, groups: groupByCategory(items) };
}

/** Human-friendly quantity label for a line, e.g. "1½ cups" or "2–3 tbsp". */
export function describeQuantity(
  item: Pick<AggregatedItem, "quantity" | "quantityMax" | "unit">,
): string {
  if (item.quantity == null) return "";
  const number =
    item.quantityMax != null
      ? `${formatQuantity(item.quantity)}–${formatQuantity(item.quantityMax)}`
      : formatQuantity(item.quantity);
  const unit = displayUnit(item.unit, item.quantityMax ?? item.quantity);
  return unit ? `${number} ${unit}` : number;
}
