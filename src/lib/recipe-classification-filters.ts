/**
 * URL helpers for the persistent classification row on the recipes page (#661).
 *
 * The row used to live inside the browse-only section, so choosing "Dinner"
 * swapped the whole view and deleted the control the user had just touched. It
 * now renders above the results at all times, which means it needs the same
 * shareable-URL semantics the rest of the filter card uses: a chip maps to a
 * querystring param, knows whether it is already applied, and can clear itself.
 *
 * This module is pure (no React, no `server-only`) so the client chips and the
 * unit tests can share exactly one definition of "active".
 */

import { type CanonicalTag, type TagCategory } from './tag-taxonomy';

/** A classification chip: a canonical tag plus how many recipes carry it. */
export type ClassificationOption = Pick<CanonicalTag, 'slug' | 'name' | 'category'> & {
  count: number;
};

/**
 * The querystring param each category filters on. Mirrors
 * {@link import("./recipe-classifications").recipeClassificationHref} so a chip
 * and a classification link always produce the same URL. Dietary tags go to
 * `tag` rather than `diet` because a tag on a recipe is author-declared, not a
 * verified dietary claim.
 */
const PARAM_BY_CATEGORY: Record<TagCategory, 'meal' | 'cuisine' | 'tag'> = {
  meal: 'meal',
  cuisine: 'cuisine',
  dietary: 'tag',
  general: 'tag',
};

export function classificationParam(
  item: Pick<ClassificationOption, 'category'>,
): 'meal' | 'cuisine' | 'tag' {
  return PARAM_BY_CATEGORY[item.category];
}

/** Cuisines filter by display name; every other category filters by slug. */
export function classificationValue(
  item: Pick<ClassificationOption, 'slug' | 'name' | 'category'>,
): string {
  return item.category === 'cuisine' ? item.name : item.slug;
}

/** True when the classification's value is already present in its own param. */
export function isClassificationActive(
  params: URLSearchParams,
  item: Pick<ClassificationOption, 'slug' | 'name' | 'category'>,
): boolean {
  const value = classificationValue(item).toLowerCase();
  return params.getAll(classificationParam(item)).some((entry) => entry.toLowerCase() === value);
}

/**
 * Toggle one classification, returning fresh params. Values are multi-select:
 * adding "Dinner" keeps "Lunch" selected, and re-picking an active chip removes
 * only itself.
 */
export function toggleClassification(
  params: URLSearchParams,
  item: Pick<ClassificationOption, 'slug' | 'name' | 'category'>,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const key = classificationParam(item);
  const value = classificationValue(item);
  const lower = value.toLowerCase();
  const kept = next.getAll(key).filter((entry) => entry.toLowerCase() !== lower);
  if (kept.length === next.getAll(key).length) kept.push(value);
  next.delete(key);
  for (const entry of kept) next.append(key, entry);
  return next;
}

/** Category display order for the row: how a cook narrows down, in order. */
const CATEGORY_RANK: Record<TagCategory, number> = {
  meal: 0,
  cuisine: 1,
  dietary: 2,
  general: 3,
};

/**
 * Pick the classifications worth surfacing as one-tap chips.
 *
 * Meals lead because "what meal is this" is the first question a cook answers,
 * then cuisine, then dietary, then free-form tags. Within a category the most
 * used classification wins, with the name as a stable tiebreak so the row does
 * not reshuffle between renders. Anything already selected is always kept, even
 * if it would fall outside the limit, so the active chip can never vanish.
 */
export function pickBrowseClassifications(
  items: ClassificationOption[],
  params: URLSearchParams,
  limit: number,
): ClassificationOption[] {
  const byRank = (a: ClassificationOption, b: ClassificationOption) =>
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
    b.count - a.count ||
    a.name.localeCompare(b.name);

  const selected = items.filter((item) => isClassificationActive(params, item));
  const selectedSlugs = new Set(selected.map((item) => item.slug));
  const rest = items
    .filter((item) => !selectedSlugs.has(item.slug))
    .sort(byRank)
    .slice(0, Math.max(0, limit - selected.length));

  return [...selected, ...rest].sort(byRank);
}
