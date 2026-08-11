import type { Route } from 'next';

import { canonicalizeTag, type CanonicalTag, type TagCategory } from './tag-taxonomy';

export type RecipeTagLink = {
  tag: {
    id?: string;
    slug?: string;
    name: string;
    category?: TagCategory;
  };
};

export type GroupedRecipeClassifications = Record<TagCategory, CanonicalTag[]>;

/** Browse URL for one classification, preserving each category's filter semantics. */
export function recipeClassificationHref(
  item: Pick<CanonicalTag, 'slug' | 'name' | 'category'>,
  options: { trustedDietary?: boolean } = {},
): Route {
  const parameter: Record<TagCategory, string> = {
    meal: 'meal',
    cuisine: 'cuisine',
    dietary: options.trustedDietary ? 'diet' : 'tag',
    general: 'tag',
  };
  const value = item.category === 'cuisine' ? item.name : item.slug;
  return `/recipes?${parameter[item.category]}=${encodeURIComponent(value)}` as Route;
}

/** Group and canonicalize persisted links, with a fallback for legacy cuisine. */
export function groupRecipeClassifications(
  links: RecipeTagLink[],
  legacyCuisine?: string | null,
): GroupedRecipeClassifications {
  const grouped: GroupedRecipeClassifications = {
    meal: [],
    cuisine: [],
    dietary: [],
    general: [],
  };
  const seen = new Set<string>();
  const legacyCanonical = legacyCuisine?.trim() ? canonicalizeTag(legacyCuisine, 'cuisine') : null;

  for (const { tag } of links) {
    let canonical = canonicalizeTag(tag.name, tag.category ?? 'general');
    if (
      legacyCanonical &&
      tag.category === 'general' &&
      canonical.category === 'general' &&
      canonical.slug === legacyCanonical.slug
    ) {
      canonical = legacyCanonical;
    }
    if (seen.has(canonical.slug)) continue;
    seen.add(canonical.slug);
    grouped[canonical.category].push(canonical);
  }

  if (grouped.cuisine.length === 0 && legacyCanonical && !seen.has(legacyCanonical.slug)) {
    grouped.cuisine.push(legacyCanonical);
  }

  for (const [category, values] of Object.entries(grouped)) {
    values.sort((a, b) => a.name.localeCompare(b.name));
    if (category === 'cuisine' && legacyCanonical) {
      const legacyIndex = values.findIndex((value) => value.slug === legacyCanonical.slug);
      if (legacyIndex > 0) {
        const [legacy] = values.splice(legacyIndex, 1);
        if (legacy) values.unshift(legacy);
      }
    }
  }
  return grouped;
}
