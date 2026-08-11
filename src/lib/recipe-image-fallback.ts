import {
  canonicalizeTag,
  recipeCategoriesInText,
  recipeCategoryForTag,
  type RecipeCategory,
} from './tag-taxonomy';
import { slugify } from './utils';

/**
 * Locally bundled Unsplash photos used under the Unsplash License. Keeping the
 * source photo ids here preserves provenance without adding runtime requests.
 *
 * Source photo ids:
 * 1504674900247-0877df9cc836, 1498837167922-ddd27525d352,
 * 1414235077428-338989a2e8c0, 1473093295043-cdd812d0e601,
 * 1533089860892-a7c6f0a88666, 1525351484163-7529414344d8,
 * 1578985545062-69928b1d9587, 1555507036-ab1f4038808a,
 * 1547592166-23ac45744acd, 1603105037880-880cd4edfb0d,
 * 1540420773420-3366772f4999, 1512621776951-a57141f2eefd,
 * 1529193591184-b1d58069ecdd, 1544025162-d76694265947,
 * 1541529086526-db283c563270, 1572695157366-5e585ab2b69f,
 * 1544145945-f90425340c7e, 1513558161293-cdaf765ed2fd,
 * 1509440159596-0249088772ff, 1549931319-a545dcf3bc73,
 * 1551183053-bf91a1d81141.
 *
 * Every asset is cropped to 1600×1000 and baked with a Gaussian sigma of 34
 * (roughly 60% visual blur), keeping the scene atmospheric but recognizable.
 */
export const RECIPE_FALLBACK_IMAGES = [
  '/img/recipe-fallbacks/shared-table.webp',
  '/img/recipe-fallbacks/kitchen-prep.webp',
  '/img/recipe-fallbacks/plated-supper.webp',
  '/img/recipe-fallbacks/pasta-table.webp',
  '/img/recipe-fallbacks/breakfast-griddle.webp',
  '/img/recipe-fallbacks/breakfast-toast.webp',
  '/img/recipe-fallbacks/baked-cake.webp',
  '/img/recipe-fallbacks/baked-pastries.webp',
  '/img/recipe-fallbacks/soup-bowl.webp',
  '/img/recipe-fallbacks/soup-pot.webp',
  '/img/recipe-fallbacks/fresh-salad.webp',
  '/img/recipe-fallbacks/fresh-greens.webp',
  '/img/recipe-fallbacks/grill-feast.webp',
  '/img/recipe-fallbacks/grill-skewers.webp',
  '/img/recipe-fallbacks/appetizer-board.webp',
  '/img/recipe-fallbacks/appetizer-bites.webp',
  '/img/recipe-fallbacks/drinks-cocktail.webp',
  '/img/recipe-fallbacks/drinks-table.webp',
  '/img/recipe-fallbacks/bread-loaves.webp',
  '/img/recipe-fallbacks/bread-basket.webp',
  '/img/recipe-fallbacks/pasta-bowl.webp',
] as const;

export type RecipeFallbackContext = {
  title?: string | null;
  cuisine?: string | null;
  tags?: readonly (string | null | undefined)[];
};

type RecipeFallbackImage = (typeof RECIPE_FALLBACK_IMAGES)[number];
type RecipeFallbackFamily =
  | 'generic'
  | 'breakfast'
  | 'baked'
  | 'soup'
  | 'fresh'
  | 'grill'
  | 'comfort'
  | 'appetizer'
  | 'drinks'
  | 'bread'
  | 'pasta';

type FamilyRule = {
  family: RecipeFallbackFamily;
  terms: readonly string[];
};

const FAMILY_IMAGES: Record<RecipeFallbackFamily, readonly RecipeFallbackImage[]> = {
  generic: RECIPE_FALLBACK_IMAGES.slice(0, 4),
  breakfast: RECIPE_FALLBACK_IMAGES.slice(4, 6),
  baked: RECIPE_FALLBACK_IMAGES.slice(6, 8),
  soup: RECIPE_FALLBACK_IMAGES.slice(8, 10),
  fresh: RECIPE_FALLBACK_IMAGES.slice(10, 12),
  grill: RECIPE_FALLBACK_IMAGES.slice(12, 14),
  appetizer: RECIPE_FALLBACK_IMAGES.slice(14, 16),
  drinks: RECIPE_FALLBACK_IMAGES.slice(16, 18),
  bread: RECIPE_FALLBACK_IMAGES.slice(18, 20),
  pasta: [RECIPE_FALLBACK_IMAGES[3], RECIPE_FALLBACK_IMAGES[20]],
  comfort: [RECIPE_FALLBACK_IMAGES[0], RECIPE_FALLBACK_IMAGES[2], RECIPE_FALLBACK_IMAGES[12]],
};

const CATEGORY_FAMILY: Record<RecipeCategory, RecipeFallbackFamily> = {
  Appetizer: 'appetizer',
  Breakfast: 'breakfast',
  Lunch: 'fresh',
  Main: 'comfort',
  Side: 'fresh',
  Salad: 'fresh',
  Soup: 'soup',
  Dessert: 'baked',
  Snack: 'appetizer',
  Drink: 'drinks',
  Bread: 'bread',
  Sauce: 'fresh',
};

const TAG_FAMILY_RULES: readonly FamilyRule[] = [
  {
    family: 'bread',
    terms: ['bread', 'breads', 'loaf', 'loaves', 'roll', 'rolls'],
  },
  {
    family: 'breakfast',
    terms: ['breakfast', 'brunch'],
  },
  {
    family: 'baked',
    terms: [
      'dessert',
      'baking',
      'sweet',
      'sweets',
      'cake',
      'cakes',
      'cookie',
      'cookies',
      'pastry',
      'pastries',
    ],
  },
  {
    family: 'soup',
    terms: ['soup', 'soups', 'stew', 'stews', 'slow cooker', 'one pot'],
  },
  {
    family: 'grill',
    terms: ['barbecue', 'bbq', 'grill', 'grilled'],
  },
  {
    family: 'appetizer',
    terms: [
      'appetizer',
      'appetizers',
      'starter',
      'starters',
      'snack',
      'snacks',
      'party',
      'parties',
      'dip',
      'dips',
    ],
  },
  {
    family: 'drinks',
    terms: ['drink', 'beverage', 'cocktail'],
  },
  {
    family: 'pasta',
    terms: ['pasta', 'noodle', 'noodles'],
  },
  {
    family: 'comfort',
    terms: ['comfort food', 'dinner', 'main course', 'kid friendly'],
  },
  {
    family: 'fresh',
    terms: ['salad', 'healthy', 'vegetarian', 'vegan', 'plant based', 'low carb', 'side dish'],
  },
];

const TITLE_FAMILY_RULES: readonly FamilyRule[] = [
  {
    family: 'pasta',
    terms: [
      'pasta',
      'spaghetti',
      'lasagna',
      'ravioli',
      'tortellini',
      'linguine',
      'fettuccine',
      'macaroni',
      'gnocchi',
      'noodle',
      'noodles',
    ],
  },
  {
    family: 'breakfast',
    terms: [
      'pancake',
      'pancakes',
      'waffle',
      'waffles',
      'omelet',
      'omelette',
      'frittata',
      'oatmeal',
      'porridge',
      'granola',
      'cereal',
      'muffin',
      'muffins',
      'scone',
      'scones',
    ],
  },
  {
    family: 'baked',
    terms: [
      'cake',
      'cakes',
      'cookie',
      'cookies',
      'brownie',
      'brownies',
      'pie',
      'pies',
      'tart',
      'tarts',
      'cobbler',
      'pastry',
      'pastries',
      'donut',
      'donuts',
      'doughnut',
      'doughnuts',
    ],
  },
  {
    family: 'grill',
    terms: ['steak', 'roast', 'burger', 'burgers', 'chop', 'chops'],
  },
  {
    family: 'generic',
    terms: ['taco', 'tacos', 'curry', 'sushi', 'dumpling', 'dumplings'],
  },
];

const CUISINE_FAMILY_RULES: readonly FamilyRule[] = [
  {
    family: 'pasta',
    terms: ['italian', 'sicilian', 'tuscan', 'mediterranean'],
  },
  {
    family: 'comfort',
    terms: ['american', 'british', 'french', 'german', 'austrian'],
  },
  {
    family: 'generic',
    terms: [
      'chinese',
      'japanese',
      'korean',
      'thai',
      'vietnamese',
      'indian',
      'mexican',
      'spanish',
      'greek',
      'middle eastern',
      'lebanese',
      'turkish',
      'caribbean',
      'african',
    ],
  },
];

function familyForTerms(
  value: string | null | undefined,
  rules: readonly FamilyRule[],
): RecipeFallbackFamily | undefined {
  const key = slugify(value ?? '');
  if (!key) return undefined;
  const searchable = `-${key}-`;
  return rules.find(({ terms }) => terms.some((term) => searchable.includes(`-${slugify(term)}-`)))
    ?.family;
}

function hashedImage(key: string, images: readonly RecipeFallbackImage[]): RecipeFallbackImage {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return images[hash % images.length]!;
}

function familyForTags(
  tags: readonly (string | null | undefined)[],
): RecipeFallbackFamily | undefined {
  const normalizedTags = tags.flatMap((tag) => {
    if (!tag) return [];
    const canonical = canonicalizeTag(tag).name;
    return [
      {
        category: recipeCategoryForTag(canonical),
        key: slugify(canonical),
      },
    ];
  });
  const categories = normalizedTags.flatMap(({ category }) => (category ? [category] : []));

  const specificCategory = categories.find(
    (category) => category !== 'Lunch' && category !== 'Main',
  );
  if (specificCategory) return CATEGORY_FAMILY[specificCategory];

  const tagKeys = new Set(normalizedTags.map(({ key }) => key));

  for (const { family, terms } of TAG_FAMILY_RULES) {
    if (terms.some((term) => tagKeys.has(slugify(term)))) return family;
  }

  const genericCategory = categories[0];
  if (genericCategory) return CATEGORY_FAMILY[genericCategory];

  return undefined;
}

/**
 * Pick the most relevant bundled image from explicit meal tags, title signals,
 * and cuisine, then fall back to the recipe's stable hash identity.
 */
export function recipeFallbackImage(
  key: string,
  context: RecipeFallbackContext = {},
): RecipeFallbackImage {
  const tagFamily = familyForTags(context.tags ?? []);
  if (tagFamily) return hashedImage(key, FAMILY_IMAGES[tagFamily]);

  const titleCategories = recipeCategoriesInText(context.title);
  const specificTitleCategory = titleCategories.find(
    (category) => category !== 'Lunch' && category !== 'Main',
  );
  if (specificTitleCategory) {
    return hashedImage(key, FAMILY_IMAGES[CATEGORY_FAMILY[specificTitleCategory]]);
  }

  const titleFamily = familyForTerms(context.title, TITLE_FAMILY_RULES);
  if (titleFamily) return hashedImage(key, FAMILY_IMAGES[titleFamily]);

  const titleCategory = titleCategories[0];
  if (titleCategory) {
    return hashedImage(key, FAMILY_IMAGES[CATEGORY_FAMILY[titleCategory]]);
  }

  const cuisineFamily = familyForTerms(context.cuisine, CUISINE_FAMILY_RULES);
  return hashedImage(key, FAMILY_IMAGES[cuisineFamily ?? 'generic']);
}
