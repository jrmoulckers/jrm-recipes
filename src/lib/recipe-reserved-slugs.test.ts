import { describe, expect, it } from 'vitest';

import { RESERVED_RECIPE_SLUGS, isReservedRecipeSlug } from './recipe-reserved-slugs';

describe('isReservedRecipeSlug', () => {
  it('flags the static sibling routes under /recipes/*', () => {
    for (const slug of ['new', 'cook-with', 'tags']) {
      expect(isReservedRecipeSlug(slug)).toBe(true);
    }
  });

  it('leaves ordinary recipe slugs alone', () => {
    for (const slug of ['apple-pie', 'new-york-cheesecake', 'tag-team-tacos']) {
      expect(isReservedRecipeSlug(slug)).toBe(false);
    }
  });

  it('is case-sensitive (slugs are always lower-cased upstream)', () => {
    expect(isReservedRecipeSlug('New')).toBe(false);
  });

  it('matches the exported reserved set', () => {
    expect([...RESERVED_RECIPE_SLUGS].every(isReservedRecipeSlug)).toBe(true);
  });
});
