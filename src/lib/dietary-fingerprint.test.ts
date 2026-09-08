import { describe, expect, it } from 'vitest';

import {
  customRestrictionTermsFingerprint,
  dietaryIngredientFingerprint,
  dietaryIngredientInputsFingerprint,
} from './dietary-fingerprint';
import type { DietaryIngredientInput } from './dietary-assessment';

const ingredient: DietaryIngredientInput = {
  ingredientId: 'ingredient_1',
  item: 'all-purpose flour',
  amount: 2,
  amountMax: null,
  unit: 'cup',
  prep: 'sifted',
  linkedFood: {
    id: 'food_flour',
    slug: 'flour',
    category: 'baking',
    allergens: ['wheat'],
  },
};

describe('dietary ingredient fingerprint', () => {
  it('is deterministic and independent of ingredient ordering', () => {
    const second = { ...ingredient, ingredientId: 'ingredient_2', item: 'water' };
    expect(dietaryIngredientFingerprint([ingredient, second])).toBe(
      dietaryIngredientFingerprint([second, ingredient]),
    );
    expect(dietaryIngredientFingerprint([ingredient])).toMatch(/^i1\.[0-9a-z]+$/);
  });

  const changes: [string, Partial<DietaryIngredientInput>][] = [
    ['item', { item: 'bread flour' }],
    ['amount', { amount: 3 }],
    ['amountMax', { amountMax: 3 }],
    ['unit', { unit: 'gram' }],
    ['prep', { prep: 'unsifted' }],
    ['linked food id', { linkedFood: { ...ingredient.linkedFood!, id: 'food_other' } }],
    ['linked food slug', { linkedFood: { ...ingredient.linkedFood!, slug: 'whole-wheat-flour' } }],
    [
      'linked food category',
      { linkedFood: { ...ingredient.linkedFood!, category: 'grain' as const } },
    ],
    ['linked food facts', { linkedFood: { ...ingredient.linkedFood!, allergens: [] } }],
  ];

  it.each(changes)('changes when %s changes', (_label, change) => {
    expect(dietaryIngredientFingerprint([{ ...ingredient, ...change }])).not.toBe(
      dietaryIngredientFingerprint([ingredient]),
    );
  });

  it('preserves null versus an explicitly curated empty allergen list', () => {
    const unknown = {
      ...ingredient,
      linkedFood: { ...ingredient.linkedFood!, allergens: null },
    };
    const knownAbsent = {
      ...ingredient,
      linkedFood: { ...ingredient.linkedFood!, allergens: [] },
    };
    expect(dietaryIngredientInputsFingerprint([unknown])).not.toBe(
      dietaryIngredientInputsFingerprint([knownAbsent]),
    );
  });

  it('rejects duplicate ingredient identities', () => {
    expect(() => dietaryIngredientFingerprint([ingredient, ingredient])).toThrow(
      'Ingredient ids must be unique',
    );
  });
});

describe('custom restriction terms fingerprint', () => {
  const terms = [
    { term: 'mushroom', source: 'exact' as const, approved: true },
    { term: 'porcini', source: 'suggested' as const, approved: false },
  ];

  it('is order-independent and changes for text, source, or approval edits', () => {
    expect(customRestrictionTermsFingerprint(terms)).toBe(
      customRestrictionTermsFingerprint([...terms].reverse()),
    );
    expect(customRestrictionTermsFingerprint(terms)).toMatch(/^r1\.[0-9a-z]+$/);
    expect(
      customRestrictionTermsFingerprint([terms[0]!, { ...terms[1]!, approved: true }]),
    ).not.toBe(customRestrictionTermsFingerprint(terms));
    expect(
      customRestrictionTermsFingerprint([terms[0]!, { ...terms[1]!, term: 'shiitake' }]),
    ).not.toBe(customRestrictionTermsFingerprint(terms));
  });
});
