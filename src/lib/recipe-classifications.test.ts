import { describe, expect, it } from 'vitest';

import { groupRecipeClassifications, recipeClassificationHref } from './recipe-classifications';

describe('groupRecipeClassifications', () => {
  it('dedupes capitalization and groups classifications by function', () => {
    const grouped = groupRecipeClassifications([
      {
        tag: {
          slug: 'italian',
          name: 'italian',
          category: 'cuisine',
        },
      },
      {
        tag: {
          slug: 'italian',
          name: 'Italian',
          category: 'cuisine',
        },
      },
      { tag: { slug: 'brunch', name: 'BRUNCH', category: 'meal' } },
      { tag: { slug: 'quick', name: 'quick', category: 'general' } },
    ]);

    expect(grouped.cuisine.map((item) => item.name)).toEqual(['Italian']);
    expect(grouped.meal.map((item) => item.name)).toEqual(['Brunch']);
    expect(grouped.general.map((item) => item.name)).toEqual(['Quick']);
  });

  it('uses a legacy cuisine only when no classified cuisine exists', () => {
    expect(groupRecipeClassifications([], ' Thai ').cuisine).toMatchObject([
      { slug: 'thai', name: 'Thai', category: 'cuisine' },
    ]);
    expect(
      groupRecipeClassifications(
        [
          {
            tag: {
              slug: 'italian',
              name: 'Italian',
              category: 'cuisine',
            },
          },
        ],
        'Thai',
      ).cuisine.map((item) => item.name),
    ).toEqual(['Italian']);
  });

  it('keeps the legacy first cuisine first when classifications are sorted', () => {
    const grouped = groupRecipeClassifications(
      [
        {
          tag: {
            slug: 'mediterranean',
            name: 'Mediterranean',
            category: 'cuisine',
          },
        },
        {
          tag: { slug: 'thai', name: 'Thai', category: 'cuisine' },
        },
      ],
      'Thai',
    );
    expect(grouped.cuisine.map((item) => item.name)).toEqual(['Thai', 'Mediterranean']);
  });

  it('uses legacy cuisine provenance for a colliding custom general tag', () => {
    const grouped = groupRecipeClassifications(
      [
        {
          tag: { slug: 'fusion', name: 'Fusion', category: 'general' },
        },
      ],
      'Fusion',
    );
    expect(grouped.cuisine).toMatchObject([
      { slug: 'fusion', name: 'Fusion', category: 'cuisine' },
    ]);
    expect(grouped.general).toEqual([]);
  });
});

describe('recipeClassificationHref', () => {
  it.each([
    ['meal', 'breakfast', 'Breakfast', '/recipes?meal=breakfast'],
    ['cuisine', 'tex-mex', 'Tex-Mex', '/recipes?cuisine=Tex-Mex'],
    ['dietary', 'gluten-free', 'Gluten-Free', '/recipes?tag=gluten-free'],
    ['general', 'weeknight', 'Weeknight', '/recipes?tag=weeknight'],
  ] as const)(
    'routes %s classifications to their functional filter',
    (category, slug, name, expected) => {
      expect(recipeClassificationHref({ category, slug, name })).toBe(expected);
    },
  );

  it('routes trusted dietary declarations through the safety filter', () => {
    expect(
      recipeClassificationHref(
        {
          category: 'dietary',
          slug: 'gluten-free',
          name: 'Gluten-Free',
        },
        { trustedDietary: true },
      ),
    ).toBe('/recipes?diet=gluten-free');
  });
});
