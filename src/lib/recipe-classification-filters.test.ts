import { describe, expect, it } from 'vitest';

import {
  type ClassificationOption,
  classificationParam,
  classificationValue,
  isClassificationActive,
  pickBrowseClassifications,
  toggleClassification,
} from './recipe-classification-filters';

const option = (
  slug: string,
  category: ClassificationOption['category'],
  count = 1,
  name = slug,
): ClassificationOption => ({ slug, name, category, count });

describe('classificationParam / classificationValue', () => {
  it('routes each category to the param that filter honors', () => {
    expect(classificationParam(option('dinner', 'meal'))).toBe('meal');
    expect(classificationParam(option('italian', 'cuisine'))).toBe('cuisine');
    expect(classificationParam(option('vegan', 'dietary'))).toBe('tag');
    expect(classificationParam(option('quick', 'general'))).toBe('tag');
  });

  it('filters cuisines by display name and everything else by slug', () => {
    expect(classificationValue(option('italian', 'cuisine', 1, 'Italian'))).toBe('Italian');
    expect(classificationValue(option('dinner', 'meal', 1, 'Dinner'))).toBe('dinner');
  });
});

describe('isClassificationActive', () => {
  it("matches case-insensitively within the classification's own param", () => {
    const params = new URLSearchParams('meal=DINNER&tag=quick');
    expect(isClassificationActive(params, option('dinner', 'meal'))).toBe(true);
    expect(isClassificationActive(params, option('quick', 'general'))).toBe(true);
    expect(isClassificationActive(params, option('lunch', 'meal'))).toBe(false);
  });

  it('does not match a value that lives under a different param', () => {
    const params = new URLSearchParams('tag=dinner');
    expect(isClassificationActive(params, option('dinner', 'meal'))).toBe(false);
  });
});

describe('toggleClassification', () => {
  it('adds a classification without disturbing the others', () => {
    const next = toggleClassification(
      new URLSearchParams('meal=lunch&q=soup'),
      option('dinner', 'meal'),
    );
    expect(next.getAll('meal')).toEqual(['lunch', 'dinner']);
    expect(next.get('q')).toBe('soup');
  });

  it('removes only itself when already active', () => {
    const next = toggleClassification(
      new URLSearchParams('meal=lunch&meal=dinner'),
      option('dinner', 'meal'),
    );
    expect(next.getAll('meal')).toEqual(['lunch']);
  });

  it('clears a differently-cased value from the URL', () => {
    const next = toggleClassification(
      new URLSearchParams('cuisine=italian'),
      option('italian', 'cuisine', 1, 'Italian'),
    );
    expect(next.getAll('cuisine')).toEqual([]);
  });

  it('leaves the source params untouched', () => {
    const params = new URLSearchParams('meal=lunch');
    toggleClassification(params, option('dinner', 'meal'));
    expect(params.toString()).toBe('meal=lunch');
  });
});

describe('pickBrowseClassifications', () => {
  const items = [
    option('quick', 'general', 40),
    option('italian', 'cuisine', 30, 'Italian'),
    option('dinner', 'meal', 20, 'Dinner'),
    option('vegan', 'dietary', 10, 'Vegan'),
    option('lunch', 'meal', 5, 'Lunch'),
  ];

  it('orders meals first, then cuisine, dietary, and general tags', () => {
    expect(
      pickBrowseClassifications(items, new URLSearchParams(), 10).map((item) => item.slug),
    ).toEqual(['dinner', 'lunch', 'italian', 'vegan', 'quick']);
  });

  it('ranks by usage inside a category and breaks ties by name', () => {
    const picked = pickBrowseClassifications(
      [
        option('brunch', 'meal', 5, 'Brunch'),
        option('dinner', 'meal', 5, 'Dinner'),
        option('supper', 'meal', 9, 'Supper'),
      ],
      new URLSearchParams(),
      10,
    );
    expect(picked.map((item) => item.slug)).toEqual(['supper', 'brunch', 'dinner']);
  });

  it('keeps an active classification visible past the limit', () => {
    const picked = pickBrowseClassifications(items, new URLSearchParams('tag=quick'), 1);
    expect(picked.map((item) => item.slug)).toContain('quick');
    expect(picked).toHaveLength(1);
  });

  it('never returns more than the limit', () => {
    expect(pickBrowseClassifications(items, new URLSearchParams(), 3)).toHaveLength(3);
  });
});
