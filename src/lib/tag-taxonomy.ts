/**
 * Controlled vocabulary for recipe classifications. Free-form tags stay allowed,
 * while common meals, cuisines, dietary labels, and aliases are folded onto one
 * canonical value so editing, display, and discovery do not fragment.
 *
 * Pure and dependency-light (only `slugify`) so it works on the client, server,
 * and in backfill scripts.
 */

import { slugify } from './utils';

export const TAG_CATEGORIES = ['meal', 'cuisine', 'dietary', 'general'] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];
export type CanonicalTag = {
  slug: string;
  name: string;
  category: TagCategory;
};

type TaxonomyEntry = CanonicalTag & { aliases: string[] };

export type RecipeCategory =
  | 'Appetizer'
  | 'Breakfast'
  | 'Lunch'
  | 'Main'
  | 'Side'
  | 'Salad'
  | 'Soup'
  | 'Dessert'
  | 'Snack'
  | 'Drink'
  | 'Bread'
  | 'Sauce';

/**
 * Curated canonical tags plus the aliases that should resolve to them. Only
 * high-confidence synonyms are listed. Ambiguous single words (e.g. "veg",
 * "side") are intentionally omitted so we never mis-merge a free-form tag.
 */
const DIETARY_TAXONOMY: TaxonomyEntry[] = [
  {
    slug: 'vegetarian',
    name: 'Vegetarian',
    category: 'dietary',
    aliases: ['veggie', 'vegetarians'],
  },
  {
    slug: 'vegan',
    name: 'Vegan',
    category: 'dietary',
    aliases: ['vegans', 'plant based', 'plant-based'],
  },
  {
    slug: 'gluten-free',
    name: 'Gluten-Free',
    category: 'dietary',
    aliases: ['gf', 'gluten free', 'glutenfree'],
  },
  {
    slug: 'dairy-free',
    name: 'Dairy-Free',
    category: 'dietary',
    aliases: ['df', 'dairy free', 'dairyfree', 'non dairy', 'non-dairy'],
  },
  {
    slug: 'egg-free',
    name: 'Egg-Free',
    category: 'dietary',
    aliases: ['egg free', 'eggfree'],
  },
  {
    slug: 'nut-free',
    name: 'Nut-Free',
    category: 'dietary',
    aliases: ['nut free', 'nutfree'],
  },
  {
    slug: 'soy-free',
    name: 'Soy-Free',
    category: 'dietary',
    aliases: ['soy free', 'soyfree'],
  },
  {
    slug: 'shellfish-free',
    name: 'Shellfish-Free',
    category: 'dietary',
    aliases: ['shellfish free', 'shellfishfree'],
  },
  {
    slug: 'fish-free',
    name: 'Fish-Free',
    category: 'dietary',
    aliases: ['fish free', 'fishfree'],
  },
  {
    slug: 'sesame-free',
    name: 'Sesame-Free',
    category: 'dietary',
    aliases: ['sesame free', 'sesamefree'],
  },
];

const MEAL_TAXONOMY: TaxonomyEntry[] = [
  {
    slug: 'breakfast',
    name: 'Breakfast',
    category: 'meal',
    aliases: ['breakfasts'],
  },
  { slug: 'brunch', name: 'Brunch', category: 'meal', aliases: [] },
  { slug: 'lunch', name: 'Lunch', category: 'meal', aliases: ['lunches'] },
  {
    slug: 'dinner',
    name: 'Dinner',
    category: 'meal',
    aliases: ['dinners', 'supper', 'suppers'],
  },
  {
    slug: 'appetizer',
    name: 'Appetizer',
    category: 'meal',
    aliases: ['appetizers', 'starter', 'starters'],
  },
  {
    slug: 'main-course',
    name: 'Main Course',
    category: 'meal',
    aliases: ['mains', 'main dish', 'main course', 'entree', 'entrée'],
  },
  {
    slug: 'side-dish',
    name: 'Side Dish',
    category: 'meal',
    aliases: ['sides', 'side dish'],
  },
  { slug: 'soup', name: 'Soup', category: 'meal', aliases: ['soups'] },
  { slug: 'salad', name: 'Salad', category: 'meal', aliases: ['salads'] },
  {
    slug: 'dessert',
    name: 'Dessert',
    category: 'meal',
    aliases: ['desserts', 'sweets', 'puddings'],
  },
  { slug: 'snack', name: 'Snack', category: 'meal', aliases: ['snacks'] },
  {
    slug: 'drink',
    name: 'Drinks',
    category: 'meal',
    aliases: ['drinks', 'beverage', 'beverages', 'cocktail', 'cocktails'],
  },
  { slug: 'bread', name: 'Bread', category: 'meal', aliases: ['breads'] },
  {
    slug: 'sauce',
    name: 'Sauce',
    category: 'meal',
    aliases: ['sauces', 'condiment', 'condiments'],
  },
];

const CUISINE_TAXONOMY_DATA = [
  ['american', 'American', ['usa', 'u.s.', 'united states']],
  ['british', 'British', ['english']],
  ['cajun-creole', 'Cajun & Creole', ['cajun', 'creole']],
  ['caribbean', 'Caribbean', []],
  ['chinese', 'Chinese', []],
  ['eastern-european', 'Eastern European', []],
  ['ethiopian', 'Ethiopian', []],
  ['filipino', 'Filipino', ['philippine', 'pinoy']],
  ['french', 'French', []],
  ['german', 'German', []],
  ['greek', 'Greek', []],
  ['indian', 'Indian', []],
  ['indonesian', 'Indonesian', []],
  ['irish', 'Irish', []],
  ['italian', 'Italian', []],
  ['japanese', 'Japanese', []],
  ['jewish', 'Jewish', []],
  ['korean', 'Korean', []],
  ['latin-american', 'Latin American', []],
  ['lebanese', 'Lebanese', []],
  ['malaysian', 'Malaysian', []],
  ['mediterranean', 'Mediterranean', []],
  ['mexican', 'Mexican', []],
  ['middle-eastern', 'Middle Eastern', ['middle eastern']],
  ['moroccan', 'Moroccan', []],
  ['persian', 'Persian', ['iranian']],
  ['russian', 'Russian', []],
  ['scandinavian', 'Scandinavian', ['nordic']],
  ['southern', 'Southern', ['southern us', 'southern american']],
  ['spanish', 'Spanish', []],
  ['tex-mex', 'Tex-Mex', ['tex mex', 'texmex']],
  ['thai', 'Thai', []],
  ['turkish', 'Turkish', []],
  ['vietnamese', 'Vietnamese', []],
] as const satisfies readonly (readonly [slug: string, name: string, aliases: readonly string[]])[];

const CUISINE_TAXONOMY: TaxonomyEntry[] = CUISINE_TAXONOMY_DATA.map(([slug, name, aliases]) => ({
  slug,
  name,
  category: 'cuisine',
  aliases: [...aliases],
}));

const GENERAL_TAXONOMY: TaxonomyEntry[] = [
  {
    slug: 'weeknight',
    name: 'Weeknight',
    category: 'general',
    aliases: ['week night', 'weeknights'],
  },
  {
    slug: 'quick',
    name: 'Quick',
    category: 'general',
    aliases: ['fast', 'speedy', 'quick and easy'],
  },
  {
    slug: 'barbecue',
    name: 'Barbecue',
    category: 'general',
    aliases: ['bbq', 'barbeque', 'bar b q'],
  },
  {
    slug: 'slow-cooker',
    name: 'Slow Cooker',
    category: 'general',
    aliases: ['crockpot', 'crock pot', 'slow cooker', 'slowcooker'],
  },
  {
    slug: 'instant-pot',
    name: 'Instant Pot',
    category: 'general',
    aliases: ['instapot', 'instant pot', 'instantpot'],
  },
  {
    slug: 'one-pot',
    name: 'One-Pot',
    category: 'general',
    aliases: ['one pot', 'onepot', 'one pan', 'one-pan'],
  },
  {
    slug: 'kid-friendly',
    name: 'Kid-Friendly',
    category: 'general',
    aliases: ['kid friendly', 'family friendly', 'family-friendly'],
  },
  {
    slug: 'healthy',
    name: 'Healthy',
    category: 'general',
    aliases: ['wholesome'],
  },
  {
    slug: 'comfort-food',
    name: 'Comfort Food',
    category: 'general',
    aliases: ['comfort food', 'comfort'],
  },
  {
    slug: 'low-carb',
    name: 'Low-Carb',
    category: 'general',
    aliases: ['low carb', 'lowcarb'],
  },
  {
    slug: 'meal-prep',
    name: 'Meal Prep',
    category: 'general',
    aliases: ['meal prep', 'mealprep'],
  },
  {
    slug: 'holiday',
    name: 'Holiday',
    category: 'general',
    aliases: ['holidays'],
  },
];

const TAXONOMY: TaxonomyEntry[] = [
  ...MEAL_TAXONOMY,
  ...CUISINE_TAXONOMY,
  ...DIETARY_TAXONOMY,
  ...GENERAL_TAXONOMY,
];

/** Match key for a free-text tag: its slug (falling back to a lowercased trim). */
function tagKey(name: string): string {
  return slugify(name).slice(0, 80) || name.trim().toLowerCase();
}

function displayName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (normalized !== normalized.toLowerCase() && normalized !== normalized.toUpperCase())
    return normalized;
  return normalized
    .toLowerCase()
    .replace(
      /(^|[\s/-])([a-z])/g,
      (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`,
    );
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
    category: 'Appetizer',
    terms: ['appetizer', 'appetizers', 'starter', 'starters'],
  },
  {
    category: 'Breakfast',
    terms: ['breakfast', 'breakfasts', 'brunch'],
  },
  { category: 'Lunch', terms: ['lunch', 'lunches'] },
  {
    category: 'Main',
    terms: [
      'dinner',
      'dinners',
      'supper',
      'suppers',
      'main',
      'mains',
      'main course',
      'main dish',
      'entree',
      'entrée',
    ],
  },
  { category: 'Side', terms: ['side', 'sides', 'side dish'] },
  { category: 'Salad', terms: ['salad', 'salads'] },
  { category: 'Soup', terms: ['soup', 'soups'] },
  {
    category: 'Dessert',
    terms: ['dessert', 'desserts', 'sweet', 'sweets', 'pudding', 'puddings'],
  },
  { category: 'Snack', terms: ['snack', 'snacks'] },
  {
    category: 'Drink',
    terms: ['drink', 'drinks', 'beverage', 'beverages', 'cocktail', 'cocktails'],
  },
  { category: 'Bread', terms: ['bread', 'breads'] },
  {
    category: 'Sauce',
    terms: ['sauce', 'sauces', 'condiment', 'condiments'],
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
export function recipeCategoriesInText(text: string | null | undefined): RecipeCategory[] {
  const key = slugify(text ?? '');
  if (!key) return [];
  const searchable = `-${key}-`;
  return RECIPE_CATEGORY_TERMS.flatMap(({ category, terms }) =>
    terms.some((term) => searchable.includes(`-${tagKey(term)}-`)) ? [category] : [],
  );
}

/** Find the first canonical meal/course term occurring in longer text. */
export function recipeCategoryInText(text: string | null | undefined): RecipeCategory | undefined {
  return recipeCategoriesInText(text)[0];
}

/** alias/canonical slug -> canonical tag. Built once at module load. */
const LOOKUP: Map<string, CanonicalTag> = (() => {
  const map = new Map<string, CanonicalTag>();
  for (const { slug, name, category, aliases } of TAXONOMY) {
    const canonical: CanonicalTag = { slug, name, category };
    map.set(slug, canonical);
    for (const alias of aliases) map.set(tagKey(alias), canonical);
  }
  return map;
})();

/**
 * Resolve a value to its canonical form. Known vocabulary always wins over the
 * hint. Unknown values keep the hinted category and a stable display label.
 */
export function canonicalizeTag(name: string, categoryHint: TagCategory = 'general'): CanonicalTag {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const canonical = LOOKUP.get(tagKey(trimmed));
  if (canonical) return canonical;
  return {
    slug: tagKey(trimmed),
    name: displayName(trimmed),
    category: categoryHint,
  };
}

/** Parse localized comma-separated classification input and de-dupe by casing. */
export function parseClassificationList(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const part of value.split(/[,،]/)) {
    const normalized = part.trim().replace(/\s+/g, ' ');
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
  }
  return values;
}

/** True when the name maps to a curated canonical tag (not free-form). */
export function isCanonicalTag(name: string): boolean {
  return LOOKUP.has(tagKey(name));
}

/** The curated vocabulary, A–Z. Surfaced as quick-add chips in the editor. */
export const SUGGESTED_TAGS: CanonicalTag[] = TAXONOMY.map(({ slug, name, category }) => ({
  slug,
  name,
  category,
})).sort((a, b) => a.name.localeCompare(b.name));

export const SUGGESTED_TAGS_BY_CATEGORY: Record<TagCategory, CanonicalTag[]> = Object.fromEntries(
  TAG_CATEGORIES.map((category) => [
    category,
    SUGGESTED_TAGS.filter((tag) => tag.category === category),
  ]),
) as Record<TagCategory, CanonicalTag[]>;
