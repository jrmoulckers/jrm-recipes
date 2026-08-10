import { describe, expect, it } from 'vitest';

import { FOOD_ALLERGENS, assertFoodAllergensValid, foodAllergensForSlug } from './food-allergens';
import { isAllergen } from './allergens';
import { FOOD_ITEMS, foodSlug } from './food-db';

describe('assertFoodAllergensValid', () => {
  it('does not throw for the curated map (keys are real food slugs, values canonical)', () => {
    expect(() => assertFoodAllergensValid()).not.toThrow();
  });

  it('every key resolves to a food in FOOD_ITEMS', () => {
    const validSlugs = new Set(FOOD_ITEMS.map((food) => foodSlug(food.name)));
    for (const slug of Object.keys(FOOD_ALLERGENS)) {
      expect(validSlugs.has(slug)).toBe(true);
    }
  });

  it('every value is a canonical Allergen token', () => {
    for (const allergens of Object.values(FOOD_ALLERGENS)) {
      for (const allergen of allergens) {
        expect(isAllergen(allergen)).toBe(true);
      }
    }
  });
});

describe('foodAllergensForSlug', () => {
  it('returns curated allergens for a known slug', () => {
    expect(foodAllergensForSlug('milk')).toEqual(['dairy']);
  });

  it('returns null for an unknown/uncurated slug (caller falls back to text)', () => {
    expect(foodAllergensForSlug('water')).toBeNull();
    expect(foodAllergensForSlug('definitely-not-a-food')).toBeNull();
  });

  it('de-duplicates and sorts multi-allergen foods canonically', () => {
    // soy sauce is brewed with wheat. Canonical order is soy before wheat.
    expect(foodAllergensForSlug('soy-sauce')).toEqual(['soy', 'wheat']);
  });
});
