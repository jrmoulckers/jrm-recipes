/**
 * Per-recipe schema.org `Recipe` JSON-LD: a pure builder that maps a recipe
 * row onto structured data for public recipe pages.
 *
 * Deliberately framework-light and free of `server-only` imports so it can be
 * unit-tested in isolation and can never throw during SSR. The page renders the
 * result in a `<script type="application/ld+json">` for publicly viewable
 * recipes only, so private/group/unlisted details are never exposed.
 */
import { absoluteUrl } from "~/lib/utils";
import { displayUnit, formatQuantity } from "~/lib/units";

export type SeoIngredient = {
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
};

export type SeoStep = {
  section: string | null;
  instruction: string;
  imageUrl?: string | null;
};

/**
 * Optional per-serving nutrition (issue #414 stores these on `recipes`). All
 * fields are nullable/absent — a recipe may carry none, some, or all — and are
 * emitted as a schema.org `NutritionInformation` object only when at least one
 * is present (issue #307). Energy is kcal and sodium is mg (whole numbers);
 * macronutrients are grams and may be fractional.
 */
export type SeoNutrition = {
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  saturatedFatGrams?: number | null;
  sodiumMg?: number | null;
  sugarGrams?: number | null;
  fiberGrams?: number | null;
};

/**
 * The minimal recipe shape the JSON-LD builder needs. `FullRecipe` from the
 * query layer is structurally assignable to this, so callers just pass the row.
 */
export type SeoRecipe = {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  servings: number | null;
  servingsNoun: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  authorId: string;
  author: { name: string | null } | null;
  ingredients: SeoIngredient[];
  steps: SeoStep[];
  ratings: { value: number; userId: string }[];
  publishedAt: Date | null;
} & SeoNutrition;

/**
 * Format a minute count as an ISO-8601 duration (`90` → `"PT1H30M"`), which is
 * what schema.org's time fields expect. Returns `undefined` for empty/invalid
 * input so callers can simply omit the field.
 */
export function minutesToIsoDuration(
  minutes: number | null | undefined,
): string | undefined {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  let out = "PT";
  if (hours > 0) out += `${hours}H`;
  if (mins > 0) out += `${mins}M`;
  return out;
}

/** Best-effort total time: explicit total, else prep + cook, else null. */
function resolveTotalMinutes(recipe: SeoRecipe): number | null {
  if (recipe.totalMinutes != null) return recipe.totalMinutes;
  const sum = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return sum > 0 ? sum : null;
}

/**
 * Average (1 decimal) + count over ratings that aren't the recipe owner's own,
 * mirroring the app's `ratingSummary`. Authors can't rate their own recipe, so
 * excluding any owner rating keeps the published aggregateRating honest.
 */
function aggregateRatings(
  ratings: { value: number; userId: string }[],
  ownerId: string,
): {
  average: number;
  count: number;
} {
  const external = ratings.filter((r) => r.userId !== ownerId);
  if (external.length === 0) return { average: 0, count: 0 };
  const sum = external.reduce((acc, r) => acc + r.value, 0);
  return {
    average: Math.round((sum / external.length) * 10) / 10,
    count: external.length,
  };
}

/** Render one ingredient as a human string (e.g. `"2 cups flour, sifted"`). */
function ingredientToText(ing: SeoIngredient): string {
  const amount: string[] = [];
  const qty = formatQuantity(ing.quantity);
  if (qty) {
    const qtyMax =
      ing.quantityMax != null ? formatQuantity(ing.quantityMax) : "";
    amount.push(qtyMax ? `${qty}\u2013${qtyMax}` : qty);
  }
  const unit = displayUnit(ing.unit, ing.quantity);
  if (unit) amount.push(unit);
  const head = amount.join(" ").trim();
  const base = head ? `${head} ${ing.item}` : ing.item;
  const line = base.trim();
  return ing.note ? `${line}, ${ing.note}` : line;
}

function recipeImages(recipe: SeoRecipe): string[] {
  return Array.from(
    new Set(
      [recipe.coverImageUrl, ...recipe.steps.map((step) => step.imageUrl)]
        .filter((url): url is string => Boolean(url))
        .map((url) => url.trim())
        .filter((url) => url.length > 0),
    ),
  );
}

/** Trim a numeric measurement to at most one decimal place (`12.0` → `"12"`). */
function trimNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * Map the per-serving nutrition columns onto a schema.org `NutritionInformation`
 * object, emitting only the properties that are actually populated. Returns
 * `undefined` when the recipe carries no nutrition data so the caller can omit
 * the field entirely (issue #307).
 */
function buildNutrition(
  recipe: SeoNutrition,
): Record<string, unknown> | undefined {
  const nutrition: Record<string, unknown> = {};

  if (recipe.calories != null && Number.isFinite(recipe.calories)) {
    nutrition.calories = `${Math.round(recipe.calories)} calories`;
  }
  const grams: [keyof SeoNutrition, string][] = [
    ["proteinGrams", "proteinContent"],
    ["carbsGrams", "carbohydrateContent"],
    ["fatGrams", "fatContent"],
    ["saturatedFatGrams", "saturatedFatContent"],
    ["sugarGrams", "sugarContent"],
    ["fiberGrams", "fiberContent"],
  ];
  for (const [field, prop] of grams) {
    const value = recipe[field];
    if (value != null && Number.isFinite(value)) {
      nutrition[prop] = `${trimNumber(value)} g`;
    }
  }
  if (recipe.sodiumMg != null && Number.isFinite(recipe.sodiumMg)) {
    nutrition.sodiumContent = `${Math.round(recipe.sodiumMg)} mg`;
  }

  if (Object.keys(nutrition).length === 0) return undefined;
  return {
    "@type": "NutritionInformation",
    servingSize: "1 serving",
    ...nutrition,
  };
}

/**
 * Build a schema.org `Recipe` object for a publicly viewable recipe. Only ever
 * called for `public` recipes; optional fields are omitted when absent so the
 * structured data stays clean.
 */
export function buildRecipeJsonLd(recipe: SeoRecipe): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    url: absoluteUrl(`/recipes/${recipe.slug}`),
  };

  if (recipe.description) jsonLd.description = recipe.description;
  const images = recipeImages(recipe);
  if (images.length > 0) jsonLd.image = images;
  if (recipe.author?.name) {
    jsonLd.author = { "@type": "Person", name: recipe.author.name };
  }
  if (recipe.publishedAt) {
    jsonLd.datePublished = recipe.publishedAt.toISOString();
  }

  const ingredients = recipe.ingredients
    .map(ingredientToText)
    .filter((line) => line.length > 0);
  if (ingredients.length > 0) jsonLd.recipeIngredient = ingredients;

  const instructions = recipe.steps
    .filter((step) => step.instruction.trim().length > 0)
    .map((step) => {
      const entry: Record<string, unknown> = {
        "@type": "HowToStep",
        text: step.instruction,
      };
      if (step.section) entry.name = step.section;
      return entry;
    });
  if (instructions.length > 0) jsonLd.recipeInstructions = instructions;

  const prep = minutesToIsoDuration(recipe.prepMinutes);
  if (prep) jsonLd.prepTime = prep;
  const cook = minutesToIsoDuration(recipe.cookMinutes);
  if (cook) jsonLd.cookTime = cook;
  const total = minutesToIsoDuration(resolveTotalMinutes(recipe));
  if (total) jsonLd.totalTime = total;

  if (recipe.servings != null) {
    jsonLd.recipeYield = `${recipe.servings} ${recipe.servingsNoun ?? "servings"}`;
  }

  const { average, count } = aggregateRatings(recipe.ratings, recipe.authorId);
  if (count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: average,
      ratingCount: count,
      reviewCount: count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const nutrition = buildNutrition(recipe);
  if (nutrition) jsonLd.nutrition = nutrition;

  return jsonLd;
}

/**
 * Serialize a JSON-LD object for embedding in a `<script>` tag, escaping `<`
 * so a value can never break out of the element (`</script>` injection).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
