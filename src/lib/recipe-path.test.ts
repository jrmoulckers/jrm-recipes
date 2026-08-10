import { describe, expect, it } from 'vitest';

import {
  recipeCookPath,
  recipeDetailPath,
  recipeEditPath,
  recipeRevalidationPaths,
} from './recipe-path';

describe('recipeDetailPath', () => {
  it('builds the canonical namespaced path when the cook slug is known', () => {
    expect(recipeDetailPath({ id: 'rec_123', slug: 'apple-pie', cook: 'ada' })).toBe(
      '/recipes/ada/apple-pie',
    );
  });

  it('falls back to the flat legacy path without a cook slug', () => {
    // Still a working URL: the `/recipes/[cook]` resolver 308s it to canonical,
    // so a caller that can't reach the author never emits a dead link.
    expect(recipeDetailPath({ id: 'rec_123', slug: 'apple-pie' })).toBe('/recipes/apple-pie');
  });

  it('falls back to the id when a recipe has no slug', () => {
    expect(recipeDetailPath({ id: 'rec_123', slug: null, cook: 'ada' })).toBe('/recipes/rec_123');
  });
});

describe('sub-route builders', () => {
  it('append their segment to the canonical detail path', () => {
    const ref = { id: 'rec_123', slug: 'apple-pie', cook: 'ada' };
    expect(recipeEditPath(ref)).toBe('/recipes/ada/apple-pie/edit');
    expect(recipeCookPath(ref)).toBe('/recipes/ada/apple-pie/cook');
  });
});

describe('recipeRevalidationPaths', () => {
  it('busts the canonical path and the flat legacy one together', () => {
    // Both are independently cached documents for the same recipe, so a write
    // that only bust one leaves old shared links serving stale content (#666).
    expect(
      recipeRevalidationPaths({
        id: 'rec_123',
        slug: 'apple-pie',
        cook: 'ada',
      }),
    ).toEqual(['/recipes/ada/apple-pie', '/recipes/apple-pie']);
  });

  it('emits a single path when there is nothing to fan out to', () => {
    expect(recipeRevalidationPaths({ id: 'rec_123', slug: 'apple-pie' })).toEqual([
      '/recipes/apple-pie',
    ]);
  });
});
