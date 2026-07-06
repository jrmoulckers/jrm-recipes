/**
 * Per-recipe SEO: pure builders for page `<metadata>` and schema.org JSON-LD.
 *
 * Everything here is deliberately framework-light and free of `server-only`
 * imports so it can be unit-tested in isolation and can never throw during the
 * build/SSR metadata pass. The route layer feeds these builders a recipe (or
 * `null` when the DB is off / the recipe is missing / it isn't publicly
 * viewable) and renders the result.
 *
 * Visibility policy (matches the task + the sibling opengraph-image route):
 *   - `public`   → rich, indexable metadata + a Recipe JSON-LD block.
 *   - otherwise  → generic brand metadata + `robots: noindex` and NO JSON-LD,
 *                  so crawlers never surface private/group/unlisted details.
 */
import { type Metadata } from "next";

import { brand } from "~/config/brand";
import { absoluteUrl } from "~/lib/utils";
import { displayUnit, formatQuantity } from "~/lib/units";

export type SeoVisibility = "private" | "group" | "unlisted" | "public";

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
};

/**
 * The minimal recipe shape the SEO builders need. `FullRecipe` from the query
 * layer is structurally assignable to this, so callers just pass the row.
 */
export type SeoRecipe = {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: SeoVisibility;
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
  if (recipe.coverImageUrl) jsonLd.image = [recipe.coverImageUrl];
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

/** Generic, non-indexed metadata for anything not publicly viewable. */
function genericMetadata(): Metadata {
  return {
    title: "Recipe",
    description: brand.description,
    robots: { index: false, follow: false },
  };
}

/**
 * Build the Next.js `Metadata` for a recipe detail page.
 *
 * @param recipe The recipe as seen by an anonymous viewer, or `null` when it's
 *   missing / the DB is off / it isn't publicly viewable.
 */
export function buildRecipeMetadata(recipe: SeoRecipe | null): Metadata {
  if (recipe?.visibility !== "public") {
    return genericMetadata();
  }

  const description = recipe.description ?? brand.description;
  const canonical = absoluteUrl(`/recipes/${recipe.slug}`);
  const images = recipe.coverImageUrl ? [recipe.coverImageUrl] : undefined;

  return {
    title: recipe.title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: recipe.title,
      description,
      url: canonical,
      siteName: brand.name,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description,
      ...(images ? { images } : {}),
    },
  };
}
