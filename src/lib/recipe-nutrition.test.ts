import { describe, expect, it } from 'vitest';

import {
  emptyRecipeNutrition,
  resolveLineGrams,
  rollUpNutrition,
  type ResolvedNutritionLine,
} from './recipe-nutrition';
import type { NutritionFacts } from './food-nutrition';

// Round-numbers facts so the arithmetic in assertions stays obvious.
const FLOUR: NutritionFacts = {
  kcal: 364,
  proteinG: 10,
  carbsG: 76,
  fatG: 1,
  fiberG: 2.7,
  sugarG: 0.3,
  sodiumMg: 2,
  sourceRef: 'TEST:flour',
};
// A tidy 100-per-100g food: grams in == every macro out.
const UNIT_FOOD: NutritionFacts = {
  kcal: 100,
  proteinG: 100,
  carbsG: 100,
  fatG: 100,
  fiberG: 100,
  sugarG: 100,
  sodiumMg: 100,
  sourceRef: 'TEST:unit',
};
// Missing the optional breakdowns. They must be treated as 0, not NaN.
const MACROS_ONLY: NutritionFacts = {
  kcal: 200,
  proteinG: 5,
  carbsG: 10,
  fatG: 8,
  sourceRef: 'TEST:macros',
};

describe('resolveLineGrams', () => {
  it('converts mass units straight to grams (ignoring density)', () => {
    expect(resolveLineGrams(2, 'kg', null)).toBe(2000);
    expect(resolveLineGrams(8, 'oz', null)).toBeCloseTo(226.796, 2);
    expect(resolveLineGrams(100, 'g', 0.9)).toBe(100);
  });

  it('converts volume units through density (g/mL)', () => {
    // 1 cup = 236.588 mL. Water-ish density 1.0 → ~236.588 g.
    expect(resolveLineGrams(1, 'cup', 1)).toBeCloseTo(236.588, 2);
    // Oil at 0.92 g/mL: 1 tbsp = 14.7868 mL → ~13.6 g.
    expect(resolveLineGrams(1, 'tbsp', 0.92)).toBeCloseTo(13.604, 2);
  });

  it('returns null for a volume unit without a usable density', () => {
    expect(resolveLineGrams(1, 'cup', null)).toBeNull();
    expect(resolveLineGrams(1, 'cup', undefined)).toBeNull();
    expect(resolveLineGrams(1, 'cup', 0)).toBeNull();
    expect(resolveLineGrams(1, 'cup', -1)).toBeNull();
  });

  it('returns null for count/unknown/temperature units', () => {
    expect(resolveLineGrams(3, 'clove', 0.9)).toBeNull();
    expect(resolveLineGrams(3, 'each', 0.9)).toBeNull();
    expect(resolveLineGrams(3, null, 0.9)).toBeNull();
    expect(resolveLineGrams(350, '°F', 0.9)).toBeNull();
  });

  it('returns null for a missing or invalid quantity', () => {
    expect(resolveLineGrams(null, 'g', null)).toBeNull();
    expect(resolveLineGrams(undefined, 'g', null)).toBeNull();
    expect(resolveLineGrams(Number.NaN, 'g', null)).toBeNull();
    expect(resolveLineGrams(-5, 'g', null)).toBeNull();
  });
});

describe('rollUpNutrition', () => {
  it('sums per-100g facts scaled by grams, then divides by servings', () => {
    // 200 g flour → factor 2 → 728 kcal whole. ÷ 4 servings = 182 kcal each.
    const est = rollUpNutrition(
      [{ quantity: 200, unit: 'g', facts: FLOUR, densityGPerMl: null }],
      4,
    );
    expect(est.whole.calories).toBeCloseTo(728, 5);
    expect(est.whole.proteinGrams).toBeCloseTo(20, 5);
    expect(est.perServing.calories).toBeCloseTo(182, 5);
    expect(est.perServing.proteinGrams).toBeCloseTo(5, 5);
    expect(est.servings).toBe(4);
    expect(est.sourcedLines).toBe(1);
    expect(est.totalLines).toBe(1);
    expect(est.lineCoverage).toBe(1);
    expect(est.massCoverage).toBe(1);
  });

  it('weighs a volume ingredient via its density', () => {
    // 1 cup at 1 g/mL = 236.588 g → factor 2.36588 of the 100-per-100g food.
    const est = rollUpNutrition(
      [{ quantity: 1, unit: 'cup', facts: UNIT_FOOD, densityGPerMl: 1 }],
      1,
    );
    expect(est.whole.calories).toBeCloseTo(236.588, 2);
    expect(est.perServing.calories).toBeCloseTo(236.588, 2);
    expect(est.accountedGrams).toBeCloseTo(236.588, 2);
  });

  it('treats absent fiber/sugar/sodium as 0, not NaN', () => {
    const est = rollUpNutrition(
      [{ quantity: 100, unit: 'g', facts: MACROS_ONLY, densityGPerMl: null }],
      1,
    );
    expect(est.whole.calories).toBe(200);
    expect(est.whole.fiberGrams).toBe(0);
    expect(est.whole.sugarGrams).toBe(0);
    expect(est.whole.sodiumMg).toBe(0);
  });

  it('skips unresolved (no facts) and unweighable lines but still counts them', () => {
    const lines: ResolvedNutritionLine[] = [
      // contributes: 100 g of the unit food
      { quantity: 100, unit: 'g', facts: UNIT_FOOD, densityGPerMl: null },
      // weighable but no facts → drags mass coverage down
      { quantity: 300, unit: 'g', facts: null, densityGPerMl: null },
      // has facts but count unit with no density → not weighable
      { quantity: 2, unit: 'clove', facts: UNIT_FOOD, densityGPerMl: null },
    ];
    const est = rollUpNutrition(lines, 1);
    expect(est.sourcedLines).toBe(1);
    expect(est.totalLines).toBe(3);
    expect(est.lineCoverage).toBeCloseTo(1 / 3, 5);
    // weighable = 100 (unit food) + 300 (no facts) = 400. Accounted = 100.
    expect(est.weighableGrams).toBe(400);
    expect(est.accountedGrams).toBe(100);
    expect(est.massCoverage).toBeCloseTo(0.25, 5);
    expect(est.whole.calories).toBe(100);
  });

  it('returns an empty (renderable-as-nothing) estimate when nothing sources', () => {
    const est = rollUpNutrition(
      [
        { quantity: 2, unit: 'clove', facts: UNIT_FOOD, densityGPerMl: null },
        { quantity: 1, unit: 'cup', facts: UNIT_FOOD, densityGPerMl: null },
      ],
      4,
    );
    expect(est.perServing).toEqual({});
    expect(est.whole).toEqual({});
    expect(est.sourcedLines).toBe(0);
    expect(est.totalLines).toBe(2);
    expect(est.lineCoverage).toBe(0);
    expect(est.massCoverage).toBe(0);
  });

  it('scales per-serving inversely with the serving count', () => {
    const line = { quantity: 400, unit: 'g', facts: UNIT_FOOD } as const;
    const two = rollUpNutrition([line], 2);
    const eight = rollUpNutrition([line], 8);
    // Whole recipe is servings-invariant. Per-serving halves as servings x4.
    expect(two.whole.calories).toBe(eight.whole.calories);
    expect(two.perServing.calories).toBe(200);
    expect(eight.perServing.calories).toBe(50);
    // whole = perServing × servings holds both ways.
    expect(eight.perServing.calories! * eight.servings).toBeCloseTo(eight.whole.calories!, 5);
  });

  it('treats a non-positive or non-finite serving count as 1', () => {
    const line = { quantity: 100, unit: 'g', facts: UNIT_FOOD } as const;
    expect(rollUpNutrition([line], 0).servings).toBe(1);
    expect(rollUpNutrition([line], -3).servings).toBe(1);
    expect(rollUpNutrition([line], Number.NaN).servings).toBe(1);
    expect(rollUpNutrition([line], 0).perServing.calories).toBe(100);
  });

  it('handles an empty ingredient list', () => {
    const est = rollUpNutrition([], 4);
    expect(est).toEqual(emptyRecipeNutrition(4));
    expect(est.perServing).toEqual({});
  });
});
