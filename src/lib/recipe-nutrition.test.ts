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

describe('portion-aware gram resolution (issue #1025)', () => {
  const EGG: NutritionFacts = {
    kcal: 143,
    proteinG: 12.6,
    carbsG: 0.7,
    fatG: 9.5,
    sodiumMg: 142,
    sourceRef: 'TEST:egg',
  };
  const OIL: NutritionFacts = {
    kcal: 884,
    proteinG: 0,
    carbsG: 0,
    fatG: 100,
    sodiumMg: 0,
    sourceRef: 'TEST:oil',
  };

  it('counts a count-measured line instead of dropping it', () => {
    // `6 eggs` resolved to null before food_portions existed, so an omelette
    // reported the calories of its cooking oil alone.
    const lines: ResolvedNutritionLine[] = [{ quantity: 6, unit: 'each', facts: EGG, slug: 'egg' }];
    const got = rollUpNutrition(lines, 2);
    // 6 eggs x 50 g = 300 g -> 143 kcal/100 g = 429 kcal, over 2 servings.
    expect(got.accountedGrams).toBeCloseTo(300, 5);
    expect(got.whole.calories).toBeCloseTo(429, 5);
    expect(got.perServing.calories).toBeCloseTo(214.5, 5);
    expect(got.sourcedLines).toBe(1);
    expect(got.lineCoverage).toBe(1);
  });

  it('no longer reports 100% mass coverage on a mostly-uncounted recipe', () => {
    // The motivating bug: an unweighable line never entered `weighableGrams`,
    // so `1 tbsp oil + 6 eggs` scored a confident massCoverage of 1.0 while
    // capturing ~4% of the food. With eggs weighable the ratio is honest.
    const lines: ResolvedNutritionLine[] = [
      { quantity: 1, unit: 'tbsp', facts: OIL, densityGPerMl: 0.92, slug: 'oil' },
      { quantity: 6, unit: 'each', facts: EGG, slug: 'egg' },
    ];
    const got = rollUpNutrition(lines, 1);
    expect(got.sourcedLines).toBe(2);
    expect(got.massCoverage).toBe(1);
    // Oil is now a small fraction of a real total rather than the whole of it.
    expect(got.accountedGrams).toBeGreaterThan(300);
    expect(got.whole.calories).toBeGreaterThan(500);
  });

  it('still drops a line whose food has no portion for the unit', () => {
    // Honest omission, not an invented weight.
    const lines: ResolvedNutritionLine[] = [
      { quantity: 1, unit: 'each', facts: MACROS_ONLY, slug: 'beef' },
    ];
    const got = rollUpNutrition(lines, 1);
    expect(got.sourcedLines).toBe(0);
    expect(got.perServing).toEqual({});
  });
});

describe('resolveLineGrams portion path', () => {
  it('resolves count units when given a slug', () => {
    expect(resolveLineGrams(2, 'each', null, 'egg')).toBeCloseTo(100, 5);
    expect(resolveLineGrams(3, 'cloves', null, 'garlic')).toBeCloseTo(9, 5);
  });

  it('keeps the original mass/density behaviour when no slug is given', () => {
    expect(resolveLineGrams(2, 'each', null)).toBeNull();
    expect(resolveLineGrams(1, 'kg', null)).toBe(1000);
    expect(resolveLineGrams(1000, 'ml', 1.03)).toBeCloseTo(1030, 5);
  });
});
