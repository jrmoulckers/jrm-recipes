import { z } from "zod";

import { slugify } from "~/lib/utils";
import type { SearchParams } from "~/lib/route-params";

/**
 * Pure search/filter/sort contract for the recipes browse page.
 *
 * This module is deliberately free of `server-only` and database imports so it
 * can be shared by the server query (`searchRecipes`) and the client controls
 * that push URL params. State lives entirely in the querystring
 * (`?q=&cuisine=&difficulty=&maxTime=&tag=&sort=`) so results are shareable and
 * SSR-friendly. `cuisine` and `tag` may repeat (`?tag=quick&tag=vegan`) or be
 * comma-joined (`?tag=quick,vegan`) to select several facet values at once,
 * while a single value stays back-compatible with older shared links.
 */

export const recipeSortValues = [
  "relevance",
  "newest",
  "quickest",
  "az",
  "top-rated",
  "popular",
] as const;
export type RecipeSort = (typeof recipeSortValues)[number];

/**
 * The default sort for a *pure* browse/filter view (no text query). Text
 * queries default to `relevance` instead — see {@link defaultSortFor}.
 */
export const DEFAULT_RECIPE_SORT: RecipeSort = "newest";

export const recipeSortLabels: Record<RecipeSort, string> = {
  relevance: "Best match",
  newest: "Newest",
  quickest: "Quickest",
  az: "A–Z",
  "top-rated": "Top rated",
  popular: "Popular",
};

/**
 * The sort applied when the URL carries no explicit `sort`: `relevance` when a
 * text query is present (so the best match leads), otherwise {@link
 * DEFAULT_RECIPE_SORT}. Relevance is meaningless without a query, so it's never
 * the implicit default for a bare browse view.
 */
export function defaultSortFor(q: string | undefined | null): RecipeSort {
  return q != null && q.length > 0 ? "relevance" : DEFAULT_RECIPE_SORT;
}

export const recipeDifficultyValues = ["easy", "medium", "hard"] as const;
export type RecipeDifficultyFilter = (typeof recipeDifficultyValues)[number];

/**
 * Raw search params as delivered by Next.js. Aliases the shared
 * {@link SearchParams} contract (#208) so the query parser and every page agree
 * on one shape.
 */
export type RawSearchParams = SearchParams;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Upper bound on selected values for a single multi-select facet. */
export const MAX_FACET_VALUES = 12;

/**
 * Parse a facet param that may repeat (`?tag=a&tag=b`) or be comma-joined
 * (`?tag=a,b`) — or carry a single value for back-compat — into a trimmed,
 * de-duped (case-insensitive), length-capped list. Order of first appearance is
 * preserved so the URL round-trips predictably.
 */
export function parseFacetList(
  value: string | string[] | undefined,
  itemMax: number,
): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of raw) {
    for (const part of chunk.split(",")) {
      const item = part.trim();
      if (item.length === 0 || item.length > itemMax) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= MAX_FACET_VALUES) return out;
    }
  }
  return out;
}

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
  difficulty: z.enum(recipeDifficultyValues).optional().catch(undefined),
  maxTime: positiveIntFromParam,
  // A saved family member's id — filters to recipes "safe for" them (#405).
  safeFor: trimmedOptional(24),
  // Left optional here so the *contextual* default (relevance for a text query,
  // newest otherwise) can be applied in `parseRecipeSearch` once `q` is known.
  sort: z.enum(recipeSortValues).optional().catch(undefined),
});

export type RecipeSearch = z.infer<typeof recipeSearchSchema> & {
  /** Selected cuisines (OR-matched). Empty when unfiltered. */
  cuisines: string[];
  /** Selected tags (AND-matched — a recipe must carry every one). */
  tags: string[];
  sort: RecipeSort;
};

/** Normalize raw Next.js search params into a validated `RecipeSearch`. */
export function parseRecipeSearch(params: RawSearchParams): RecipeSearch {
  const parsed = recipeSearchSchema.parse({
    q: first(params.q),
    difficulty: first(params.difficulty),
    maxTime: first(params.maxTime),
    safeFor: first(params.safeFor),
    sort: first(params.sort),
  });
  return {
    ...parsed,
    cuisines: parseFacetList(params.cuisine, 80),
    tags: parseFacetList(params.tag, 60),
    sort: parsed.sort ?? defaultSortFor(parsed.q),
  };
}

/** True when any narrowing filter (not sort) is applied. */
export function hasActiveRecipeFilters(search: RecipeSearch): boolean {
  return (
    search.q != null ||
    search.cuisines.length > 0 ||
    search.difficulty != null ||
    search.maxTime != null ||
    search.tags.length > 0 ||
    search.safeFor != null
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
  for (const cuisine of search.cuisines ?? []) params.append("cuisine", cuisine);
  if (search.difficulty) params.set("difficulty", search.difficulty);
  if (search.maxTime != null) params.set("maxTime", String(search.maxTime));
  for (const tag of search.tags ?? []) params.append("tag", tag);
  if (search.safeFor) params.set("safeFor", search.safeFor);
  if (search.sort && search.sort !== defaultSortFor(search.q))
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

/** Upper bound on pantry items accepted by the "cook with what you have" mode. */
export const MAX_PANTRY_ITEMS = 15;

/**
 * Parse the `?have=` pantry list for the "cook with what you have" mode. Accepts
 * a comma-joined value (`?have=chicken,rice`) or repeated params, trimming and
 * de-duping (case-insensitive) into a length-capped list so the URL round-trips
 * and stays shareable.
 */
export function parseHaveParam(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of raw) {
    for (const part of chunk.split(",")) {
      const item = part.trim();
      if (item.length === 0 || item.length > 60) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= MAX_PANTRY_ITEMS) return out;
    }
  }
  return out;
}
