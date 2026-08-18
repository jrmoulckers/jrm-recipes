import { z } from 'zod';

import { slugify } from '~/lib/utils';
import { type NutritionKey } from '~/lib/nutrients';
import { DIETARY_TAGS, isDietaryTag, type DietaryTag } from '~/lib/substitutions';
import type { SearchParams } from '~/lib/route-params';

/**
 * Pure search/filter/sort contract for the recipes browse page.
 *
 * This module is deliberately free of `server-only` and database imports so it
 * can be shared by the server query (`searchRecipes`) and the client controls
 * that push URL params. State lives entirely in the querystring
 * (`?q=&meal=&cuisine=&difficulty=&maxTime=&tag=&diet=&safeFor=&group=&mine=&sort=`)
 * so results are shareable and SSR-friendly. Classification params may repeat
 * or be comma-joined to select several values at once.
 */

/** The per-serving nutrient a macro filter or sort ranks on. */
export type MacroNutrientKey = Extract<
  NutritionKey,
  'calories' | 'proteinGrams' | 'carbsGrams' | 'fatGrams'
>;

export const recipeSortValues = [
  'relevance',
  'newest',
  'quickest',
  'az',
  'top-rated',
  'popular',
  'protein-high',
  'calories-low',
] as const;
export type RecipeSort = (typeof recipeSortValues)[number];

/**
 * The sorts that rank on a per-serving macro (#1047), and the nutrient each one
 * ranks by.
 *
 * A macro sort is not a presentation choice the way `az` is: ordering recipes by
 * protein asserts that we *know* each one's protein. So a macro sort carries the
 * same eligibility gate as a macro filter — a recipe we cannot rank honestly is
 * withheld and counted rather than parked at the end of the list, where its
 * position would still read as a claim.
 */
export const MACRO_SORT_NUTRIENTS = {
  'protein-high': 'proteinGrams',
  'calories-low': 'calories',
} as const satisfies Partial<Record<RecipeSort, MacroNutrientKey>>;

export type MacroSort = keyof typeof MACRO_SORT_NUTRIENTS;

/** True when `sort` ranks on a macro and therefore needs nutrition to be known. */
export function isMacroSort(sort: RecipeSort): sort is MacroSort {
  return sort in MACRO_SORT_NUTRIENTS;
}

/**
 * The default sort for a *pure* browse/filter view (no text query). Text
 * queries default to `relevance` instead. See {@link defaultSortFor}.
 */
export const DEFAULT_RECIPE_SORT: RecipeSort = 'newest';

export const recipeSortLabels: Record<RecipeSort, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  quickest: 'Quickest',
  az: 'A–Z',
  'top-rated': 'Top rated',
  popular: 'Popular',
  'protein-high': 'Most protein',
  'calories-low': 'Fewest calories',
};

/**
 * The per-serving macro filters (#1047).
 *
 * Three, not eight, and each maps to a question a cook actually asks: "enough
 * protein", "not too many calories", "not too many carbs". Every one is a
 * *bound* rather than a range, because a range invites a precision the
 * underlying estimate does not have.
 *
 * `bound` is a sanity ceiling on the input, not a nutritional claim — it exists
 * so a hand-edited URL cannot ask the database to compare against 1e9.
 */
export const MACRO_FILTERS = [
  { param: 'minProtein', nutrient: 'proteinGrams', direction: 'min', bound: 500 },
  { param: 'maxCalories', nutrient: 'calories', direction: 'max', bound: 10000 },
  { param: 'maxCarbs', nutrient: 'carbsGrams', direction: 'max', bound: 1000 },
] as const satisfies readonly {
  param: string;
  nutrient: MacroNutrientKey;
  direction: 'min' | 'max';
  bound: number;
}[];

export type MacroFilterDef = (typeof MACRO_FILTERS)[number];
export type MacroFilterParam = MacroFilterDef['param'];

/** An applied macro bound: its definition plus the value the URL carried. */
export type ActiveMacroFilter = MacroFilterDef & { value: number };

/**
 * The sort applied when the URL carries no explicit `sort`: `relevance` when a
 * text query is present (so the best match leads), otherwise {@link
 * DEFAULT_RECIPE_SORT}. Relevance is meaningless without a query, so it's never
 * the implicit default for a bare browse view.
 */
export function defaultSortFor(q: string | undefined | null): RecipeSort {
  return q != null && q.length > 0 ? 'relevance' : DEFAULT_RECIPE_SORT;
}

export const recipeDifficultyValues = ['easy', 'medium', 'hard'] as const;
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
 * (`?tag=a,b`), or carry a single value for back-compat, into a trimmed,
 * de-duped (case-insensitive), length-capped list. Order of first appearance is
 * preserved so the URL round-trips predictably.
 */
export function parseFacetList(value: string | string[] | undefined, itemMax: number): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of raw) {
    for (const part of chunk.split(',')) {
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

/**
 * Parse a dietary facet param (`?diet=vegan,gluten-free` or repeated) into a
 * de-duped list of canonical {@link DietaryTag}s, ordered as in
 * {@link DIETARY_TAGS}. Reuses {@link parseFacetList} for tolerant
 * comma/repeat/case handling, then narrows to known tags (lower-cased) so a
 * hand-edited or stale value can never inject a non-tag into the SQL filter.
 */
export function parseDietList(value: string | string[] | undefined): DietaryTag[] {
  const selected = new Set(
    parseFacetList(value, 20)
      .map((v) => v.toLowerCase())
      .filter(isDietaryTag),
  );
  return DIETARY_TAGS.filter((tag) => selected.has(tag));
}

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v));

/**
 * A tolerant boolean coerced from a querystring flag. Accepts `1`/`true`/`yes`/`on`
 * (case-insensitive) as `true`. Anything else, including missing, is `false`, so
 * a hand-edited or absent value degrades to "off" rather than throwing.
 */
const booleanFromParam = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (v == null) return false;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
  });

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

/**
 * A positive integer coerced from a possibly-empty/garbage querystring value,
 * clamped to `bound`. Invalid input (empty, non-numeric, <= 0) collapses to
 * `undefined` rather than throwing so a hand-edited URL never 500s the page. A
 * value above `bound` is clamped rather than dropped: the user asked for
 * "at most a lot", and answering that is closer to their intent than silently
 * removing their filter.
 */
const boundedIntFromParam = (bound: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (v == null || v.length === 0) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      const int = Math.floor(n);
      if (int <= 0) return undefined;
      return Math.min(int, bound);
    });

const macroSchemaShape = Object.fromEntries(
  MACRO_FILTERS.map((f) => [f.param, boundedIntFromParam(f.bound)]),
) as { [K in MacroFilterParam]: ReturnType<typeof boundedIntFromParam> };

export const recipeSearchSchema = z.object({
  q: trimmedOptional(120),
  difficulty: z.enum(recipeDifficultyValues).optional().catch(undefined),
  maxTime: positiveIntFromParam,
  // A saved family member's id. Filters to recipes "safe for" them (#405).
  safeFor: trimmedOptional(24),
  // A group id the viewer belongs to. Filters to that family/group's recipes
  // (#91). Single-value because `recipes.groupId` is single-valued. Validated
  // against the viewer's own groups in `searchRecipes`.
  group: trimmedOptional(24),
  // "Only mine". Narrows to the signed-in viewer's own recipes (#91). Only
  // meaningful when a viewer is present. Ignored server-side when signed out.
  mine: booleanFromParam,
  // Ingredient-led filter: a free-text ingredient term (e.g. "cilantro") that
  // the server resolves to a canonical food node via the food graph, then
  // constrains results to recipes that actually use that food (by structured
  // `recipe_ingredients.foodId` / the reverse `food_recipe_links` index) rather
  // than a fuzzy text match. Composes with the FTS query and every other filter.
  ingredient: trimmedOptional(60),
  // Per-serving macro bounds (#1047). Composed with every other filter.
  ...macroSchemaShape,
  // Include recipes whose nutrition is too uncertain to rank (or missing
  // entirely) in a macro-filtered/sorted view, each marked as such. Off by
  // default: a filtered list reads as an answer, so an unrankable recipe is
  // withheld and *disclosed* rather than silently mixed in. This is the user's
  // explicit "show them anyway".
  showUncertain: booleanFromParam,
  // Left optional here so the *contextual* default (relevance for a text query,
  // newest otherwise) can be applied in `parseRecipeSearch` once `q` is known.
  sort: z.enum(recipeSortValues).optional().catch(undefined),
});

export type RecipeSearch = z.infer<typeof recipeSearchSchema> & {
  /** Selected meals/courses (OR-matched). Empty when unfiltered. */
  meals: string[];
  /** Selected cuisines (OR-matched). Empty when unfiltered. */
  cuisines: string[];
  /** Selected tags (AND-matched. A recipe must carry every one). */
  tags: string[];
  /**
   * Selected dietary tags (AND-matched. A recipe must satisfy every one,
   * via its declared ∪ derived dietary tags). Empty when unfiltered (#273).
   */
  diets: DietaryTag[];
  sort: RecipeSort;
};

/** Normalize raw Next.js search params into a validated `RecipeSearch`. */
export function parseRecipeSearch(params: RawSearchParams): RecipeSearch {
  const parsed = recipeSearchSchema.parse({
    q: first(params.q),
    difficulty: first(params.difficulty),
    maxTime: first(params.maxTime),
    safeFor: first(params.safeFor),
    group: first(params.group),
    mine: first(params.mine),
    ingredient: first(params.ingredient),
    showUncertain: first(params.showUncertain),
    ...Object.fromEntries(MACRO_FILTERS.map((f) => [f.param, first(params[f.param])])),
    sort: first(params.sort),
  });
  return {
    ...parsed,
    meals: parseFacetList(params.meal, 80),
    cuisines: parseFacetList(params.cuisine, 80),
    tags: parseFacetList(params.tag, 80),
    diets: parseDietList(params.diet),
    sort: parsed.sort ?? defaultSortFor(parsed.q),
  };
}

/** The macro bounds the URL actually carried, in declaration order. */
export function activeMacroFilters(search: RecipeSearch): ActiveMacroFilter[] {
  return MACRO_FILTERS.flatMap((f) => {
    const value = search[f.param];
    return value == null ? [] : [{ ...f, value }];
  });
}

/**
 * True when the view ranks or narrows on nutrition, and therefore has to answer
 * for the confidence of the numbers it is ranking on. Either a macro bound or a
 * macro sort is enough — both make a claim about a recipe's macros.
 */
export function usesMacroNutrition(search: RecipeSearch): boolean {
  return activeMacroFilters(search).length > 0 || isMacroSort(search.sort);
}

/** True when any narrowing filter (not sort) is applied. */
export function hasActiveRecipeFilters(search: RecipeSearch): boolean {
  return (
    search.q != null ||
    search.meals.length > 0 ||
    search.cuisines.length > 0 ||
    search.difficulty != null ||
    search.maxTime != null ||
    search.tags.length > 0 ||
    search.diets.length > 0 ||
    search.safeFor != null ||
    search.group != null ||
    search.ingredient != null ||
    activeMacroFilters(search).length > 0 ||
    search.mine
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
 * Build a clean `URLSearchParams` from a (partial) search. Omitting empty
 * values and the default sort so shared URLs stay tidy.
 */
export function recipeSearchToParams(search: Partial<RecipeSearch>): URLSearchParams {
  const params = new URLSearchParams();
  if (search.q) params.set('q', search.q);
  for (const meal of search.meals ?? []) params.append('meal', meal);
  for (const cuisine of search.cuisines ?? []) params.append('cuisine', cuisine);
  if (search.difficulty) params.set('difficulty', search.difficulty);
  if (search.maxTime != null) params.set('maxTime', String(search.maxTime));
  for (const tag of search.tags ?? []) params.append('tag', tag);
  for (const diet of search.diets ?? []) params.append('diet', diet);
  if (search.safeFor) params.set('safeFor', search.safeFor);
  if (search.group) params.set('group', search.group);
  if (search.ingredient) params.set('ingredient', search.ingredient);
  for (const filter of MACRO_FILTERS) {
    const value = search[filter.param];
    if (value != null) params.set(filter.param, String(value));
  }
  if (search.showUncertain) params.set('showUncertain', '1');
  if (search.mine) params.set('mine', '1');
  if (search.sort && search.sort !== defaultSortFor(search.q)) params.set('sort', search.sort);
  return params;
}

/** Serialize a search to a query string (`""` when nothing is set). */
export function recipeSearchToQueryString(search: Partial<RecipeSearch>): string {
  return recipeSearchToParams(search).toString();
}

/** Slug form used to match a `tag` filter against the `tags` table. */
export function tagFilterSlug(tag: string): string {
  return slugify(tag) || tag.trim().toLowerCase().slice(0, 80);
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
    for (const part of chunk.split(',')) {
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
