import { z } from "zod";

import { slugify } from "~/lib/utils";

/**
 * Pure search/filter/sort contract for the recipes browse page.
 *
 * This module is deliberately free of `server-only` and database imports so it
 * can be shared by the server query (`searchRecipes`) and the client controls
 * that push URL params. State lives entirely in the querystring
 * (`?q=&cuisine=&difficulty=&maxTime=&tag=&sort=`) so results are shareable and
 * SSR-friendly.
 */

export const recipeSortValues = [
  "newest",
  "quickest",
  "az",
  "top-rated",
] as const;
export type RecipeSort = (typeof recipeSortValues)[number];

export const DEFAULT_RECIPE_SORT: RecipeSort = "newest";

export const recipeSortLabels: Record<RecipeSort, string> = {
  newest: "Newest",
  quickest: "Quickest",
  az: "A–Z",
  "top-rated": "Top rated",
};

export const recipeDifficultyValues = ["easy", "medium", "hard"] as const;
export type RecipeDifficultyFilter = (typeof recipeDifficultyValues)[number];

/** Raw search params as delivered by Next.js (`string | string[] | undefined`). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v));

/**
 * A positive integer coerced from a possibly-empty/garbage querystring value.
 * Invalid input (empty, non-numeric, <= 0) collapses to `undefined` rather than
 * throwing so a hand-edited URL never 500s the page.
 */
const positiveIntFromParam = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (v == null || v.length === 0) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const int = Math.floor(n);
    return int > 0 && int <= 100000 ? int : undefined;
  });

export const recipeSearchSchema = z.object({
  q: trimmedOptional(120),
  cuisine: trimmedOptional(80),
  difficulty: z.enum(recipeDifficultyValues).optional().catch(undefined),
  maxTime: positiveIntFromParam,
  tag: trimmedOptional(60),
  sort: z.enum(recipeSortValues).catch(DEFAULT_RECIPE_SORT),
});

export type RecipeSearch = z.infer<typeof recipeSearchSchema>;

/** Normalize raw Next.js search params into a validated `RecipeSearch`. */
export function parseRecipeSearch(params: RawSearchParams): RecipeSearch {
  return recipeSearchSchema.parse({
    q: first(params.q),
    cuisine: first(params.cuisine),
    difficulty: first(params.difficulty),
    maxTime: first(params.maxTime),
    tag: first(params.tag),
    sort: first(params.sort) ?? DEFAULT_RECIPE_SORT,
  });
}

/** True when any narrowing filter (not sort) is applied. */
export function hasActiveRecipeFilters(search: RecipeSearch): boolean {
  return (
    search.q != null ||
    search.cuisine != null ||
    search.difficulty != null ||
    search.maxTime != null ||
    search.tag != null
  );
}

/**
 * True when the view is untouched (no filters and default sort), so the page can
 * keep its classic "Your cookbook / Discover" layout instead of a flat results
 * grid.
 */
export function isDefaultRecipeView(search: RecipeSearch): boolean {
  return !hasActiveRecipeFilters(search) && search.sort === DEFAULT_RECIPE_SORT;
}

/**
 * Build a clean `URLSearchParams` from a (partial) search — omitting empty
 * values and the default sort so shared URLs stay tidy.
 */
export function recipeSearchToParams(
  search: Partial<RecipeSearch>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.cuisine) params.set("cuisine", search.cuisine);
  if (search.difficulty) params.set("difficulty", search.difficulty);
  if (search.maxTime != null) params.set("maxTime", String(search.maxTime));
  if (search.tag) params.set("tag", search.tag);
  if (search.sort && search.sort !== DEFAULT_RECIPE_SORT)
    params.set("sort", search.sort);
  return params;
}

/** Serialize a search to a query string (`""` when nothing is set). */
export function recipeSearchToQueryString(
  search: Partial<RecipeSearch>,
): string {
  return recipeSearchToParams(search).toString();
}

/** Slug form used to match a `tag` filter against the `tags` table. */
export function tagFilterSlug(tag: string): string {
  return slugify(tag).slice(0, 60) || tag.trim().toLowerCase();
}
