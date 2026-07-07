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
  author: { name: string | null } | null;
  ingredients: SeoIngredient[];
  steps: SeoStep[];
  ratings: { value: number }[];
  publishedAt: Date | null;
};

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

/** Average (1 decimal) + count, mirroring the app's `ratingSummary`. */
function aggregateRatings(ratings: { value: number }[]): {
  average: number;
  count: number;
} {
  if (ratings.length === 0) return { average: 0, count: 0 };
  const sum = ratings.reduce((acc, r) => acc + r.value, 0);
  return {
    average: Math.round((sum / ratings.length) * 10) / 10,
    count: ratings.length,
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

  const { average, count } = aggregateRatings(recipe.ratings);
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

  return jsonLd;
}

/**
 * Serialize a JSON-LD object for embedding in a `<script>` tag, escaping `<`
 * so a value can never break out of the element (`</script>` injection).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
