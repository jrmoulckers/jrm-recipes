import { describe, expect, it } from 'vitest';

import { foodSlug } from './food-db';
import {
  NUTRITION_BY_SLUG,
  estimateIngredientGrams,
  estimatePerServingNutrition,
  estimateRecipeNutrition,
  nutritionForFood,
  toGrams,
} from './food-nutrition';
import { macros } from './nutrients';

describe('nutritionForFood', () => {
  it('resolves a known food to its per-100g facts', () => {
    const onion = nutritionForFood('onion');
    expect(onion).not.toBeNull();
    expect(onion?.kcal).toBe(40);
    expect(onion?.sourceRef).toMatch(/^FDC:/);
  });

  it('resolves through the tolerant canonicalizer (variety, prep, casing)', () => {
    const facts = nutritionForFood('2 large Yellow Onions, finely diced');
    expect(facts?.kcal).toBe(40);
    // same facts as the bare canonical name
    expect(facts).toEqual(nutritionForFood('onion'));
  });

  it('returns null for unknown or empty input', () => {
    expect(nutritionForFood('dilithium crystals')).toBeNull();
    expect(nutritionForFood('')).toBeNull();
    expect(nutritionForFood(null)).toBeNull();
    expect(nutritionForFood(undefined)).toBeNull();
  });

  it('keys the map by canonical slug', () => {
    expect(NUTRITION_BY_SLUG.get(foodSlug('Tomato'))?.kcal).toBe(18);
    expect(NUTRITION_BY_SLUG.has(foodSlug('Olive oil'))).toBe(false);
  });

  it('keeps macros non-negative and finite across the whole dataset', () => {
    for (const [, f] of NUTRITION_BY_SLUG) {
      for (const v of [f.kcal, f.proteinG, f.carbsG, f.fatG]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(f.sourceRef.length).toBeGreaterThan(0);
    }
  });
});

describe('toGrams', () => {
  it('converts mass units directly (no density needed)', () => {
    expect(toGrams(1, 'g')).toBe(1);
    expect(toGrams(2, 'kg')).toBe(2000);
    expect(toGrams(1, 'oz')).toBeCloseTo(28.35, 2);
    expect(toGrams(1, 'lb')).toBeCloseTo(453.592, 2);
  });

  it('accepts tolerant unit aliases', () => {
    expect(toGrams(1, 'grams')).toBe(1);
    expect(toGrams(1, 'Ounce')).toBeCloseTo(28.35, 2);
    expect(toGrams(1, 'tablespoon', 1)).toBeCloseTo(14.7868, 3);
  });

  it('converts volume units only when a density is supplied', () => {
    // water: 1 g/mL → 1 cup ≈ 236.6 g
    expect(toGrams(1, 'cup', 1)).toBeCloseTo(236.588, 2);
    expect(toGrams(1, 'fl oz', 1)).toBeCloseTo(29.574, 2);
    expect(toGrams(1, 'cup', null)).toBeNull();
    expect(toGrams(1, 'cup', undefined)).toBeNull();
  });

  it('returns null for count/unknown units and bad quantities', () => {
    expect(toGrams(1, 'each', 1)).toBeNull();
    expect(toGrams(1, 'pinch', 1)).toBeNull();
    expect(toGrams(1, '', 1)).toBeNull();
    expect(toGrams(-1, 'g')).toBeNull();
    expect(toGrams(Number.NaN, 'g')).toBeNull();
  });
});

describe('estimateIngredientGrams', () => {
  it('resolves density from food-db for a volume unit', () => {
    // oil density ~0.92 g/mL → 1 cup ≈ 217 g
    const g = estimateIngredientGrams('olive oil', 1, 'cup');
    expect(g).not.toBeNull();
    expect(g!).toBeGreaterThan(180);
    expect(g!).toBeLessThan(240);
  });

  it('weighs mass units regardless of the food', () => {
    expect(estimateIngredientGrams('chicken', 500, 'g')).toBe(500);
  });

  it('weighs a counted food through its curated portion (#1029)', () => {
    // The text path used to drop every counted line while the graph path
    // weighed it, so a recipe's calories depended on whether its ingredients
    // happened to be graph-linked. One onion ≈ 110 g (USDA, medium).
    expect(estimateIngredientGrams('onion', 2, 'each')).toBeCloseTo(220, 5);
    expect(estimateIngredientGrams('garlic', 3, 'cloves')).toBeCloseTo(9, 5);
  });

  it('is null when no gram path exists at all', () => {
    expect(estimateIngredientGrams('onion', 1, 'splash')).toBeNull();
    expect(estimateIngredientGrams('dragon fruit essence', 1, 'each')).toBeNull();
  });

  it('is null with a missing quantity', () => {
    expect(estimateIngredientGrams('flour', null, 'cup')).toBeNull();
  });
});

describe('estimateRecipeNutrition', () => {
  it('rolls up totals and reports full coverage when all lines resolve', () => {
    const roll = estimateRecipeNutrition([
      { item: 'chicken', quantity: 200, unit: 'g' },
      { item: 'olive oil', quantity: 1, unit: 'tbsp' },
    ]);
    expect(roll.total).toBe(2);
    expect(roll.sourced).toBe(2);
    expect(roll.coverage).toBe(1);
    // chicken: 165 kcal/100g * 2 = 330. Oil: 1 tbsp ≈ 13.6g * 8.84 ≈ 120
    expect(roll.kcal).toBeGreaterThan(400);
    expect(roll.proteinG).toBeGreaterThan(60); // ~62 from chicken
  });

  it('counts unresolved/unweighable lines toward coverage but not totals', () => {
    const roll = estimateRecipeNutrition([
      { item: 'chicken', quantity: 100, unit: 'g' },
      { item: 'onion', quantity: 2, unit: 'splash' }, // resolves but no gram path
      { item: 'dragon fruit essence', quantity: 1, unit: 'g' }, // unknown food
    ]);
    expect(roll.total).toBe(3);
    expect(roll.sourced).toBe(1);
    expect(roll.coverage).toBeCloseTo(1 / 3, 5);
    expect(roll.kcal).toBeCloseTo(165, 5);
  });

  it('includes counted ingredients now that portions resolve them (#1029)', () => {
    const roll = estimateRecipeNutrition([
      { item: 'olive oil', quantity: 1, unit: 'tbsp' },
      { item: 'egg', quantity: 6, unit: 'each' },
    ]);
    expect(roll.total).toBe(2);
    expect(roll.sourced).toBe(2);
    expect(roll.coverage).toBe(1);
    // 6 large eggs ≈ 300 g at ~143 kcal/100 g ≈ 429 kcal, far more than the
    // ~120 kcal of oil the text engine used to report on its own.
    expect(roll.kcal).toBeGreaterThan(400);
    expect(roll.proteinG).toBeGreaterThan(30);
  });

  it('ignores blank items and is empty-safe', () => {
    const roll = estimateRecipeNutrition([
      { item: '  ', quantity: 1, unit: 'g' },
      { item: '', quantity: 1, unit: 'g' },
    ]);
    expect(roll.total).toBe(0);
    expect(roll.coverage).toBe(0);
    // Nothing contributed, so no nutrient is claimed at all (#1028): an absent
    // amount means unknown, where a `0` would assert the recipe has none.
    expect(roll.kcal).toBeUndefined();
  });

  it('is order-independent', () => {
    const a = estimateRecipeNutrition([
      { item: 'flour', quantity: 100, unit: 'g' },
      { item: 'sugar', quantity: 50, unit: 'g' },
    ]);
    const b = estimateRecipeNutrition([
      { item: 'sugar', quantity: 50, unit: 'g' },
      { item: 'flour', quantity: 100, unit: 'g' },
    ]);
    expect(a).toEqual(b);
  });
});

describe('estimatePerServingNutrition', () => {
  it('divides the whole-recipe roll-up by the serving count', () => {
    const whole = estimateRecipeNutrition([{ item: 'chicken', quantity: 400, unit: 'g' }]);
    const per = estimatePerServingNutrition([{ item: 'chicken', quantity: 400, unit: 'g' }], 4);
    const wholeMacros = macros(whole);
    expect(per.perServing.calories).toBeCloseTo(wholeMacros.calories / 4, 5);
    expect(per.perServing.proteinGrams).toBeCloseTo(wholeMacros.protein / 4, 5);
    // chicken 165 kcal/100g * 400g = 660 kcal / 4 = 165
    expect(per.perServing.calories).toBeCloseTo(165, 5);
  });

  it('maps to the app Nutrition shape, saturated fat included (#1028)', () => {
    const per = estimatePerServingNutrition([{ item: 'beef', quantity: 200, unit: 'g' }], 2);
    for (const key of [
      'calories',
      'proteinGrams',
      'carbsGrams',
      'fatGrams',
      'saturatedFatGrams',
      'sodiumMg',
    ] as const) {
      expect(typeof per.perServing[key]).toBe('number');
    }
    // Beef is 6.0 g saturated fat per 100 g: 200 g over 2 servings = 6.0.
    expect(per.perServing.saturatedFatGrams).toBeCloseTo(6, 5);
  });

  it('omits a nutrient no contributing food carries', () => {
    // Sugar (the food) is pure sucrose: no fat, so no saturated-fat figure.
    const per = estimatePerServingNutrition([{ item: 'sugar', quantity: 100, unit: 'g' }], 1);
    expect(per.perServing.calories).toBeGreaterThan(0);
    expect(per.perServing.saturatedFatGrams).toBeUndefined();
  });

  it('carries coverage/sourced/total through', () => {
    const per = estimatePerServingNutrition(
      [
        { item: 'chicken', quantity: 100, unit: 'g' },
        { item: 'onion', quantity: 1, unit: 'splash' }, // no grams
      ],
      4,
    );
    expect(per.total).toBe(2);
    expect(per.sourced).toBe(1);
    expect(per.coverage).toBeCloseTo(0.5, 5);
  });

  it('returns an empty record when nothing can be sourced', () => {
    const per = estimatePerServingNutrition([{ item: 'onion', quantity: 1, unit: 'splash' }], 4);
    expect(per.perServing).toEqual({});
    expect(per.sourced).toBe(0);
  });

  it('treats a non-positive serving count as 1', () => {
    const one = estimatePerServingNutrition([{ item: 'chicken', quantity: 100, unit: 'g' }], 0);
    const also = estimatePerServingNutrition([{ item: 'chicken', quantity: 100, unit: 'g' }], 1);
    expect(one.perServing.calories).toBeCloseTo(also.perServing.calories!, 5);
  });
});
