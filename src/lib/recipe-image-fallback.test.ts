import { describe, expect, it } from 'vitest';

import { RECIPE_FALLBACK_IMAGES, recipeFallbackImage } from './recipe-image-fallback';

describe('recipeFallbackImage', () => {
  it('prioritizes explicit meal tags over title and cuisine signals', () => {
    const selected = recipeFallbackImage('semantic-priority', {
      tags: ['Dessert'],
      title: 'Blueberry Buttermilk Pancakes',
      cuisine: 'Italian',
    });

    expect([
      '/img/recipe-fallbacks/baked-cake.webp',
      '/img/recipe-fallbacks/baked-pastries.webp',
    ]).toContain(selected);
  });

  it.each([
    ['Breakfast', 'breakfast'],
    ['Dessert', 'baked'],
    ['Soup', 'soup'],
    ['Salad', 'fresh'],
    ['Barbecue', 'grill'],
    ['Appetizer', 'appetizer'],
    ['Cocktail', 'drinks'],
    ['Bread', 'bread'],
  ])('maps the %s tag to the %s image family', (tag, family) => {
    expect(
      recipeFallbackImage(`${family}-recipe`, {
        tags: [tag],
        title: 'Blueberry Buttermilk Pancakes',
        cuisine: 'Italian',
      }),
    ).toMatch(new RegExp(`/recipe-fallbacks/${family}[-.]`));
  });

  it('recognizes breakfast dishes from sparse recipe titles', () => {
    expect(
      recipeFallbackImage('blueberry-pancakes', {
        title: 'Blueberry Buttermilk Pancakes',
      }),
    ).toMatch(/\/recipe-fallbacks\/breakfast-/);
  });

  it.each([
    [['bread', 'baking', 'vegetarian', 'weekend'], 'bread'],
    [['Breads', 'Baking'], 'bread'],
    [['Soups', 'Vegetarian'], 'soup'],
    [['Barbeque', 'Vegetarian'], 'grill'],
    [['Crockpot', 'Vegetarian'], 'soup'],
    [['Cookies'], 'baked'],
    [['Cakes'], 'baked'],
    [['Pastries'], 'baked'],
    [['Noodles'], 'pasta'],
    [['Rolls'], 'bread'],
  ])('prioritizes the specific course in %j over broad descriptors', (tags, family) => {
    expect(recipeFallbackImage('specific-course', { tags })).toMatch(
      new RegExp(`/recipe-fallbacks/${family}-`),
    );
  });

  it.each([
    ['Steak Salad', 'fresh'],
    ['Dumpling Soup', 'soup'],
    ['Dinner Salad', 'fresh'],
    ['Lunch Soup', 'soup'],
    ['Lunch Dumpling Soup', 'soup'],
  ])('prioritizes the explicit course in %s over a dish keyword', (title, family) => {
    expect(recipeFallbackImage(title, { title })).toMatch(
      new RegExp(`/recipe-fallbacks/${family}-`),
    );
  });

  it('keeps ambiguous curry titles in the generic rotation', () => {
    expect(recipeFallbackImage('chicken-curry', { title: 'Chicken Curry' })).toMatch(
      /\/recipe-fallbacks\/(?:shared-table|kitchen-prep|plated-supper|pasta-table)\.webp/,
    );
  });

  it('uses cuisine when meal and title signals are absent', () => {
    expect(
      recipeFallbackImage('family-special', {
        title: 'Family Special',
        cuisine: 'Northern Italian',
      }),
    ).toMatch(/\/recipe-fallbacks\/pasta-/);
  });

  it('keeps the hash fallback stable when context has no known signal', () => {
    const key = 'grandmas-secret';
    expect(
      recipeFallbackImage(key, {
        title: "Grandma's Secret",
        cuisine: 'Family Style',
        tags: ['Heirloom'],
      }),
    ).toBe(recipeFallbackImage(key));
  });

  it('returns the same bundled image for the same recipe key', () => {
    const first = recipeFallbackImage('recipe-family-lasagna');

    expect(recipeFallbackImage('recipe-family-lasagna')).toBe(first);
    expect(RECIPE_FALLBACK_IMAGES).toContain(first);
  });

  it('varies imagery deterministically within a matched family', () => {
    const selected = new Set(
      Array.from({ length: 24 }, (_, index) =>
        recipeFallbackImage(`breakfast-${index}`, {
          tags: ['Breakfast'],
        }),
      ),
    );

    expect(selected).toEqual(
      new Set([
        '/img/recipe-fallbacks/breakfast-griddle.webp',
        '/img/recipe-fallbacks/breakfast-toast.webp',
      ]),
    );
  });

  it('keeps unmatched recipes inside the generic rotation', () => {
    const selected = new Set(
      Array.from({ length: 40 }, (_, index) => recipeFallbackImage(`unknown-${index}`)),
    );

    expect(selected).toEqual(
      new Set([
        '/img/recipe-fallbacks/shared-table.webp',
        '/img/recipe-fallbacks/kitchen-prep.webp',
        '/img/recipe-fallbacks/plated-supper.webp',
        '/img/recipe-fallbacks/pasta-table.webp',
      ]),
    );
  });
});
