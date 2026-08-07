import {
  recipeCategoryForTag,
  recipeCategoryInText,
  type RecipeCategory,
} from "./tag-taxonomy";
import { slugify } from "./utils";

/**
 * Locally bundled Unsplash photos used under the Unsplash License. Keeping the
 * source photo ids here preserves provenance without adding runtime requests.
 *
 * - photo-1504674900247-0877df9cc836
 * - photo-1498837167922-ddd27525d352
 * - photo-1414235077428-338989a2e8c0
 * - photo-1473093295043-cdd812d0e601
 */
export const RECIPE_FALLBACK_IMAGES = [
  "/img/recipe-fallbacks/shared-table.webp",
  "/img/recipe-fallbacks/kitchen-prep.webp",
  "/img/recipe-fallbacks/plated-supper.webp",
  "/img/recipe-fallbacks/pasta-table.webp",
] as const;

export type RecipeFallbackContext = {
  title?: string | null;
  cuisine?: string | null;
  tags?: readonly (string | null | undefined)[];
};

type RecipeFallbackImage = (typeof RECIPE_FALLBACK_IMAGES)[number];

const SHARED_TABLE = RECIPE_FALLBACK_IMAGES[0];
const KITCHEN_PREP = RECIPE_FALLBACK_IMAGES[1];
const PLATED_SUPPER = RECIPE_FALLBACK_IMAGES[2];
const PASTA_TABLE = RECIPE_FALLBACK_IMAGES[3];

const CATEGORY_IMAGE: Record<RecipeCategory, RecipeFallbackImage> = {
  Appetizer: SHARED_TABLE,
  Breakfast: KITCHEN_PREP,
  Lunch: SHARED_TABLE,
  Main: PLATED_SUPPER,
  Side: SHARED_TABLE,
  Salad: KITCHEN_PREP,
  Soup: SHARED_TABLE,
  Dessert: KITCHEN_PREP,
  Snack: SHARED_TABLE,
  Drink: SHARED_TABLE,
  Bread: KITCHEN_PREP,
  Sauce: KITCHEN_PREP,
};

const TITLE_IMAGE_RULES: readonly {
  image: RecipeFallbackImage;
  terms: readonly string[];
}[] = [
  {
    image: PASTA_TABLE,
    terms: [
      "pasta",
      "spaghetti",
      "lasagna",
      "ravioli",
      "tortellini",
      "linguine",
      "fettuccine",
      "macaroni",
      "gnocchi",
      "noodle",
      "noodles",
    ],
  },
  {
    image: KITCHEN_PREP,
    terms: [
      "pancake",
      "pancakes",
      "waffle",
      "waffles",
      "omelet",
      "omelette",
      "frittata",
      "oatmeal",
      "porridge",
      "granola",
      "cereal",
      "muffin",
      "muffins",
      "scone",
      "scones",
      "cake",
      "cakes",
      "cookie",
      "cookies",
      "brownie",
      "brownies",
      "pie",
      "pies",
      "tart",
      "tarts",
      "cobbler",
      "pastry",
      "pastries",
      "donut",
      "donuts",
      "doughnut",
      "doughnuts",
    ],
  },
  {
    image: PLATED_SUPPER,
    terms: ["steak", "roast", "burger", "burgers", "chop", "chops"],
  },
  {
    image: SHARED_TABLE,
    terms: ["taco", "tacos", "curry", "sushi", "dumpling", "dumplings"],
  },
];

const CUISINE_IMAGE_RULES: readonly {
  image: RecipeFallbackImage;
  terms: readonly string[];
}[] = [
  {
    image: PASTA_TABLE,
    terms: ["italian", "sicilian", "tuscan", "mediterranean"],
  },
  {
    image: PLATED_SUPPER,
    terms: ["american", "british", "french", "german", "austrian"],
  },
  {
    image: SHARED_TABLE,
    terms: [
      "chinese",
      "japanese",
      "korean",
      "thai",
      "vietnamese",
      "indian",
      "mexican",
      "spanish",
      "greek",
      "middle eastern",
      "lebanese",
      "turkish",
      "caribbean",
      "african",
    ],
  },
];

function imageForTerms(
  value: string | null | undefined,
  rules: typeof TITLE_IMAGE_RULES,
): RecipeFallbackImage | undefined {
  const key = slugify(value ?? "");
  if (!key) return undefined;
  const searchable = `-${key}-`;
  return rules.find(({ terms }) =>
    terms.some((term) => searchable.includes(`-${slugify(term)}-`)),
  )?.image;
}

function hashedFallbackImage(key: string): RecipeFallbackImage {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return RECIPE_FALLBACK_IMAGES[hash % RECIPE_FALLBACK_IMAGES.length]!;
}

/**
 * Pick the most relevant bundled image from explicit meal tags, title signals,
 * and cuisine, then fall back to the recipe's stable hash identity.
 */
export function recipeFallbackImage(
  key: string,
  context: RecipeFallbackContext = {},
): RecipeFallbackImage {
  for (const tag of context.tags ?? []) {
    const category = tag ? recipeCategoryForTag(tag) : undefined;
    if (category) return CATEGORY_IMAGE[category];
  }

  const titleCategory = recipeCategoryInText(context.title);
  if (titleCategory) return CATEGORY_IMAGE[titleCategory];

  const titleImage = imageForTerms(context.title, TITLE_IMAGE_RULES);
  if (titleImage) return titleImage;

  const cuisineImage = imageForTerms(context.cuisine, CUISINE_IMAGE_RULES);
  return cuisineImage ?? hashedFallbackImage(key);
}
