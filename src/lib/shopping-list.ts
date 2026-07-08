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
import { detectAllergensForSafety, type Allergen } from "./allergens";

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
  /**
   * True when at least one contribution was optional, even if others were
   * required. Lets the UI surface "partially optional" lines that `optional`
   * (all-optional) alone would hide.
   */
  hasOptional: boolean;
  /** Recipe ids that contributed to this line (deduped, in first-seen order). */
  recipeIds: string[];
  /**
   * Best-effort allergens detected in this line's name (issue #432), rolled up
   * from the same knowledge base the recipe page uses. Lets the list warn when
   * an item carries an allergen the active family member must avoid. Uses the
   * conservative direct+hidden union so a hidden source (e.g. wheat in soy
   * sauce) still warns an allergic member.
   */
  allergens: Allergen[];
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
 * Keyword rules grouped by aisle. Every keyword is compiled into a whole-word
 * matcher (see `COMPILED_RULES`); when several keywords match an item the most
 * specific one (longest phrase) wins, with rule order breaking ties. Keeping
 * the rules ordered broad-aisle-first therefore only affects genuine ties —
 * "coconut milk" (Pantry) still beats "milk" (Dairy) even though Dairy is
 * listed first, because its keyword is more specific.
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
      "bell pepper",
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
      "peanut butter",
      "raisin",
      "cracker",
      "breadcrumb",
      "stock cube",
      "bouillon",
      "water",
    ],
  },
];

/** Escape a literal string for safe interpolation into a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a keyword into a whole-word / whole-phrase matcher. Word boundaries
 * are any non-alphanumeric character (or a string edge), so "corn" never
 * matches inside "cornstarch" and "ham" never matches inside "graham". A
 * trailing "s"/"es" is tolerated so "carrot" also matches "carrots" and
 * "tomato" also matches "tomatoes".
 */
function keywordMatcher(keyword: string): RegExp {
  const body = escapeRegExp(keyword.trim().toLowerCase()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![a-z0-9])${body}(?:es|s)?(?![a-z0-9])`, "i");
}

type CompiledRule = {
  category: ShoppingCategory;
  /** Owning rule's position; lower wins on ties (broad aisles listed first). */
  order: number;
  /** Word count of the keyword; higher = more specific and wins outright. */
  specificity: number;
  matcher: RegExp;
};

/**
 * Flattened, precompiled rules. `categorize` tests every keyword and keeps the
 * most specific match (longest phrase), breaking ties by rule order. This lets
 * a precise multi-word keyword such as "coconut milk" (Pantry) beat a broad
 * single word like "milk" (Dairy) regardless of declaration order, while
 * single-word collisions ("broth" vs "chicken") still fall back to priority.
 */
const COMPILED_RULES: CompiledRule[] = CATEGORY_RULES.flatMap((rule, order) =>
  rule.keywords.map((keyword) => ({
    category: rule.category,
    order,
    specificity: keyword.trim().split(/\s+/).length,
    matcher: keywordMatcher(keyword),
  })),
);

/** Categorize a free-text ingredient name into a grocery aisle. */
export function categorize(item: string): ShoppingCategory {
  const name = item.toLowerCase().trim().replace(/\s+/g, " ");
  if (!name) return "Other";

  let best: CompiledRule | null = null;
  for (const rule of COMPILED_RULES) {
    if (!rule.matcher.test(name)) continue;
    if (
      best === null ||
      rule.specificity > best.specificity ||
      (rule.specificity === best.specificity && rule.order < best.order)
    ) {
      best = rule;
    }
  }
  return best?.category ?? "Other";
}

// --- Pantry staples -----------------------------------------------------

/**
 * The things a busy parent has never once needed to buy on a weeknight run
 * (issue #412): salt, pepper, water, cooking oils, butter, and a few common
 * dried spices. When a recipe is added to the list these are omitted by default
 * so the list you actually shop from is short; an "include staples" override
 * keeps them for the week you really are out of oil.
 *
 * Deliberately conservative — fresh herbs/aromatics (basil, cilantro, ginger,
 * garlic, onion) are excluded so a real produce purchase is never auto-hidden.
 */
export const PANTRY_STAPLES = [
  "salt",
  "sea salt",
  "kosher salt",
  "table salt",
  "pepper",
  "black pepper",
  "white pepper",
  "peppercorn",
  "water",
  "cold water",
  "warm water",
  "hot water",
  "oil",
  "olive oil",
  "extra virgin olive oil",
  "vegetable oil",
  "canola oil",
  "sunflower oil",
  "cooking oil",
  "cooking spray",
  "butter",
  "garlic powder",
  "onion powder",
  "chili powder",
  "paprika",
  "cumin",
  "cinnamon",
  "cayenne",
  "bay leaf",
  "bay leaves",
  "nutmeg",
] as const;

/**
 * Descriptors that may precede a staple's head noun without changing that the
 * item is still that staple — "ground black pepper", "extra virgin olive oil",
 * "fine sea salt", "unsalted butter". Deliberately does NOT include
 * ingredient-defining words like "bell", "peanut", "coconut" or "sesame": when
 * one of those precedes a staple word the item is a distinct must-buy ("bell
 * pepper", "peanut butter", "coconut water", "sesame oil") and stays on the
 * list.
 */
const STAPLE_QUALIFIERS = new Set<string>([
  "ground",
  "freshly",
  "fresh",
  "dried",
  "whole",
  "fine",
  "finely",
  "coarse",
  "coarsely",
  "flaky",
  "kosher",
  "sea",
  "table",
  "rock",
  "black",
  "white",
  "extra",
  "virgin",
  "light",
  "cooking",
  "vegetable",
  "canola",
  "olive",
  "sunflower",
  "salted",
  "unsalted",
  "melted",
  "softened",
  "warm",
  "hot",
  "cold",
  "boiling",
  "iced",
]);

/**
 * Ingredients that literally contain a staple word but are distinct purchases a
 * shopper must never lose. Belt-and-suspenders backup to the qualifier logic so
 * these are always kept even if the allow-list ever grows carelessly.
 */
const STAPLE_EXCEPTIONS = new Set<string>([
  "bell pepper",
  "red bell pepper",
  "green bell pepper",
  "yellow bell pepper",
  "orange bell pepper",
  "red pepper",
  "green pepper",
  "jalapeño pepper",
  "jalapeno pepper",
  "banana pepper",
  "peanut butter",
  "almond butter",
  "apple butter",
  "cocoa butter",
  "cashew butter",
  "coconut water",
  "rose water",
  "water chestnut",
  "sesame oil",
  "chili oil",
  "truffle oil",
]);

/** Staple phrases, normalized and ordered longest-first so a specific phrase
 * ("olive oil") is preferred over a broad head noun ("oil"). */
const STAPLE_PHRASES: string[] = Array.from(
  new Set(PANTRY_STAPLES.map(normalizeItemName)),
).sort((a, b) => b.split(" ").length - a.split(" ").length);

/**
 * True when `cleaned` is a staple whose head noun sits at the end of the name,
 * preceded only by allowed qualifiers. An unknown leading word (bell, peanut,
 * coconut, …) fails the prefix check so the item is treated as a real purchase.
 */
function matchesStaplePhrase(cleaned: string): boolean {
  for (const phrase of STAPLE_PHRASES) {
    if (cleaned === phrase) return true;
    if (cleaned.endsWith(` ${phrase}`)) {
      const prefix = cleaned.slice(0, cleaned.length - phrase.length - 1);
      const prefixTokens = prefix.split(" ").filter(Boolean);
      if (prefixTokens.every((token) => STAPLE_QUALIFIERS.has(token))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when an ingredient name is a pantry staple (see {@link PANTRY_STAPLES}) —
 * i.e. a staple is its HEAD NOUN, optionally preceded by neutral qualifiers.
 * Matching on the head noun (not mere whole-word containment) is what keeps
 * "bell pepper", "peanut butter", "coconut water" and "sesame oil" on the list
 * while still dropping "salt", "ground black pepper" and "olive oil". Used only
 * when auto-building a list from a recipe — manually added items are never run
 * through this.
 */
export function isPantryStaple(item: string): boolean {
  const name = normalizeItemName(item);
  if (!name) return false;
  // Defensive: drop a leading quantity/number ("2 eggs", "1/2 cup ...") so the
  // head-noun check sees the ingredient words. Item names are usually
  // quantity-free, but free-text entries aren't guaranteed to be.
  const cleaned = name.replace(
    /^(?:\d+(?:[.,/]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s+/,
    "",
  );
  if (STAPLE_EXCEPTIONS.has(cleaned)) return false;
  if (matchesStaplePhrase(cleaned)) return true;
  // Tolerate a plural head noun ("peppercorns" → "peppercorn"); the prefix guard
  // still protects compounds ("bell peppers" keeps "bell" as an unknown word).
  const singular = cleaned.replace(/s$/, "");
  return singular !== cleaned && matchesStaplePhrase(singular);
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
  anyOptional: boolean;
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
        anyOptional: false,
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
    if (input.optional) acc.anyOptional = true;
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
    hasOptional: acc.anyOptional,
    recipeIds: acc.recipeIds,
    allergens: detectAllergensForSafety(acc.item),
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
    // Any missing or non-canonical category falls back to "Other" so the item
    // is never silently dropped from the grouped view.
    const category = CATEGORY_INDEX.has(item.category) ? item.category : "Other";
    const list = groups.get(category) ?? [];
    list.push(item);
    groups.set(category, list);
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

/** Minimal shape needed to render one list line as shareable text. */
export type ShoppingTextItem = Pick<
  AggregatedItem,
  "item" | "quantity" | "quantityMax" | "unit"
> & {
  note?: string | null;
  category: ShoppingCategory;
  checked?: boolean;
};

export type FormatShoppingListOptions = {
  /** Include already-checked ("in cart") items. Default false. */
  includeChecked?: boolean;
  /** Optional heading placed at the top of the text. */
  title?: string;
};

function shareLine(item: ShoppingTextItem): string {
  const amount = describeQuantity(item);
  const base = amount ? `${amount} ${item.item}` : item.item;
  return item.note ? `${base} — ${item.note}` : base;
}

/**
 * Serialize a shopping list to tidy, human-readable plain text grouped by aisle
 * with Markdown-style checkboxes ("- [ ] 2 lb chicken") so it pastes cleanly
 * into Messages/WhatsApp/Notes (issue #408). Already-checked items are excluded
 * by default. Pure — no DOM — so it is unit-testable and safe on the server.
 */
export function formatShoppingListText(
  items: ShoppingTextItem[],
  options: FormatShoppingListOptions = {},
): string {
  const { includeChecked = false, title } = options;
  const visible = items.filter((item) => includeChecked || !item.checked);
  if (visible.length === 0) return "";

  const byCategory = new Map<ShoppingCategory, ShoppingTextItem[]>();
  for (const item of visible) {
    const category = CATEGORY_INDEX.has(item.category) ? item.category : "Other";
    const list = byCategory.get(category) ?? [];
    list.push(item);
    byCategory.set(category, list);
  }

  const lines: string[] = [];
  if (title?.trim()) lines.push(title.trim(), "");

  for (const category of SHOPPING_CATEGORIES) {
    const group = byCategory.get(category);
    if (!group || group.length === 0) continue;
    lines.push(`${category}:`);
    for (const item of group
      .slice()
      .sort((a, b) => a.item.localeCompare(b.item))) {
      lines.push(`- [${item.checked ? "x" : " "}] ${shareLine(item)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
