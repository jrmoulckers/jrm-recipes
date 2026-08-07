/**
 * Controlled vocabulary for recipe tags. Free-form tags stay allowed, but common
 * synonyms and abbreviations ("gf", "veggie", "bbq", "crockpot") are folded onto
 * a single canonical tag so discovery and the filter list don't fragment.
 *
 * Pure and dependency-light (only `slugify`) so it works on the client (editor
 * suggestions), the server (`syncTags`), and in a backfill script.
 */

import { slugify } from "./utils";

export type CanonicalTag = { slug: string; name: string };

type TaxonomyEntry = CanonicalTag & { aliases: string[] };

export type RecipeCategory =
  | "Appetizer"
  | "Breakfast"
  | "Lunch"
  | "Main"
  | "Side"
  | "Salad"
  | "Soup"
  | "Dessert"
  | "Snack"
  | "Drink"
  | "Bread"
  | "Sauce";

/**
 * Curated canonical tags plus the aliases that should resolve to them. Only
 * high-confidence synonyms are listed. Ambiguous single words (e.g. "veg",
 * "side") are intentionally omitted so we never mis-merge a free-form tag.
 */
const TAXONOMY: TaxonomyEntry[] = [
  {
    slug: "vegetarian",
    name: "Vegetarian",
    aliases: ["veggie", "vegetarians"],
  },
  {
    slug: "vegan",
    name: "Vegan",
    aliases: ["vegans", "plant based", "plant-based"],
  },
  {
    slug: "gluten-free",
    name: "Gluten-Free",
    aliases: ["gf", "gluten free", "glutenfree"],
  },
  {
    slug: "dairy-free",
    name: "Dairy-Free",
    aliases: ["df", "dairy free", "dairyfree", "non dairy", "non-dairy"],
  },
  { slug: "egg-free", name: "Egg-Free", aliases: ["egg free", "eggfree"] },
  {
    slug: "weeknight",
    name: "Weeknight",
    aliases: ["week night", "weeknights"],
  },
  {
    slug: "quick",
    name: "Quick",
    aliases: ["fast", "speedy", "quick and easy"],
  },
  { slug: "dinner", name: "Dinner", aliases: ["dinners", "supper", "suppers"] },
  {
    slug: "dessert",
    name: "Dessert",
    aliases: ["desserts", "sweets", "puddings"],
  },
  {
    slug: "appetizer",
    name: "Appetizer",
    aliases: ["appetizers", "starter", "starters"],
  },
  { slug: "side-dish", name: "Side Dish", aliases: ["sides", "side dish"] },
  {
    slug: "main-course",
    name: "Main Course",
    aliases: ["mains", "main dish", "main course", "entree", "entrée"],
  },
  { slug: "soup", name: "Soup", aliases: ["soups"] },
  { slug: "salad", name: "Salad", aliases: ["salads"] },
  { slug: "snack", name: "Snack", aliases: ["snacks"] },
  { slug: "breakfast", name: "Breakfast", aliases: ["breakfasts"] },
  {
    slug: "barbecue",
    name: "Barbecue",
    aliases: ["bbq", "barbeque", "bar b q"],
  },
  {
    slug: "slow-cooker",
    name: "Slow Cooker",
    aliases: ["crockpot", "crock pot", "slow cooker", "slowcooker"],
  },
  {
    slug: "instant-pot",
    name: "Instant Pot",
    aliases: ["instapot", "instant pot", "instantpot"],
  },
  {
    slug: "one-pot",
    name: "One-Pot",
    aliases: ["one pot", "onepot", "one pan", "one-pan"],
  },
  {
    slug: "kid-friendly",
    name: "Kid-Friendly",
    aliases: ["kid friendly", "family friendly", "family-friendly"],
  },
  { slug: "healthy", name: "Healthy", aliases: ["wholesome"] },
  {
    slug: "comfort-food",
    name: "Comfort Food",
    aliases: ["comfort food", "comfort"],
  },
  { slug: "low-carb", name: "Low-Carb", aliases: ["low carb", "lowcarb"] },
  { slug: "meal-prep", name: "Meal Prep", aliases: ["meal prep", "mealprep"] },
  { slug: "holiday", name: "Holiday", aliases: ["holidays"] },
];

/** Match key for a free-text tag: its slug (falling back to a lowercased trim). */
function tagKey(name: string): string {
  return slugify(name).slice(0, 60) || name.trim().toLowerCase();
}

/**
 * Shared meal/course vocabulary for tag normalization, structured data, and
 * semantic recipe imagery.
 */
const RECIPE_CATEGORY_TERMS: readonly {
  category: RecipeCategory;
  terms: readonly string[];
}[] = [
  {
    category: "Appetizer",
    terms: ["appetizer", "appetizers", "starter", "starters"],
  },
  {
    category: "Breakfast",
    terms: ["breakfast", "breakfasts", "brunch"],
  },
  { category: "Lunch", terms: ["lunch", "lunches"] },
  {
    category: "Main",
    terms: [
      "dinner",
      "dinners",
      "supper",
      "suppers",
      "main",
      "mains",
      "main course",
      "main dish",
      "entree",
      "entrée",
    ],
  },
  { category: "Side", terms: ["side", "sides", "side dish"] },
  { category: "Salad", terms: ["salad", "salads"] },
  { category: "Soup", terms: ["soup", "soups"] },
  {
    category: "Dessert",
    terms: ["dessert", "desserts", "sweet", "sweets", "pudding", "puddings"],
  },
  { category: "Snack", terms: ["snack", "snacks"] },
  {
    category: "Drink",
    terms: [
      "drink",
      "drinks",
      "beverage",
      "beverages",
      "cocktail",
      "cocktails",
    ],
  },
  { category: "Bread", terms: ["bread", "breads"] },
  {
    category: "Sauce",
    terms: ["sauce", "sauces", "condiment", "condiments"],
  },
];

const RECIPE_CATEGORY_LOOKUP = new Map<string, RecipeCategory>(
  RECIPE_CATEGORY_TERMS.flatMap(({ category, terms }) =>
    terms.map((term) => [tagKey(term), category] as const),
  ),
);

/** Resolve an exact free-text tag to its canonical meal/course category. */
export function recipeCategoryForTag(name: string): RecipeCategory | undefined {
  return RECIPE_CATEGORY_LOOKUP.get(tagKey(name));
}

/** Find every canonical meal/course term occurring in longer text. */
export function recipeCategoriesInText(
  text: string | null | undefined,
): RecipeCategory[] {
  const key = slugify(text ?? "");
  if (!key) return [];
  const searchable = `-${key}-`;
  return RECIPE_CATEGORY_TERMS.flatMap(({ category, terms }) =>
    terms.some((term) => searchable.includes(`-${tagKey(term)}-`))
      ? [category]
      : [],
  );
}

/** Find the first canonical meal/course term occurring in longer text. */
export function recipeCategoryInText(
  text: string | null | undefined,
): RecipeCategory | undefined {
  return recipeCategoriesInText(text)[0];
}

/** alias/canonical slug -> canonical tag. Built once at module load. */
const LOOKUP: Map<string, CanonicalTag> = (() => {
  const map = new Map<string, CanonicalTag>();
  for (const { slug, name, aliases } of TAXONOMY) {
    const canonical: CanonicalTag = { slug, name };
    map.set(slug, canonical);
    for (const alias of aliases) map.set(tagKey(alias), canonical);
  }
  return map;
})();

/**
 * Resolve a free-form tag name to its canonical form. Known aliases collapse to
 * the curated tag. Unknown tags pass through with a normalized slug and their
 * original (trimmed) display name.
 */
export function canonicalizeTag(name: string): CanonicalTag {
  const trimmed = name.trim();
  const canonical = LOOKUP.get(tagKey(trimmed));
  if (canonical) return canonical;
  return { slug: tagKey(trimmed), name: trimmed };
}

/** True when the name maps to a curated canonical tag (not free-form). */
export function isCanonicalTag(name: string): boolean {
  return LOOKUP.has(tagKey(name));
}

/** The curated vocabulary, A–Z. Surfaced as quick-add chips in the editor. */
export const SUGGESTED_TAGS: CanonicalTag[] = TAXONOMY.map(
  ({ slug, name }) => ({
    slug,
    name,
  }),
).sort((a, b) => a.name.localeCompare(b.name));
