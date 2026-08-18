import { describe, expect, it } from 'vitest';

import {
  emptyNutritionView,
  emptyRecipeNutrition,
  resolveLineGrams,
  resolveNutritionView,
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
    // One line, weighed on a scale, with curated facts: nothing was estimated.
    expect(est.confidence).toBe(1);
    expect(est.unresolvedLines).toEqual([]);
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
      // weighable but no facts → contributes 0 confidence over its 300 g
      { quantity: 300, unit: 'g', facts: null, densityGPerMl: null, label: 'mystery powder' },
      // has facts but count unit with no density → not weighable at all
      { quantity: 2, unit: 'clove', facts: UNIT_FOOD, densityGPerMl: null, label: 'garlic' },
    ];
    const est = rollUpNutrition(lines, 1);
    expect(est.sourcedLines).toBe(1);
    expect(est.totalLines).toBe(3);
    expect(est.lineCoverage).toBeCloseTo(1 / 3, 5);
    // weighable = 100 (unit food) + 300 (no facts) = 400. Accounted = 100.
    expect(est.weighableGrams).toBe(400);
    expect(est.accountedGrams).toBe(100);
    // Mass-weighted over the two weighable lines: (100×1 + 300×0) / 400 = 0.25,
    // then diluted by the third line, which could not be weighed: × 2/3.
    expect(est.confidence).toBeCloseTo(0.25 * (2 / 3), 5);
    expect(est.unresolvedLines).toEqual([
      { label: 'mystery powder', reason: 'facts' },
      { label: 'garlic', reason: 'weight' },
    ]);
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
    expect(est.confidence).toBe(0);
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
    // capturing ~4% of the food. With eggs weighable the estimate is honest.
    const lines: ResolvedNutritionLine[] = [
      { quantity: 1, unit: 'tbsp', facts: OIL, densityGPerMl: 0.92, slug: 'oil' },
      { quantity: 6, unit: 'each', facts: EGG, slug: 'egg' },
    ];
    const got = rollUpNutrition(lines, 1);
    expect(got.sourcedLines).toBe(2);
    expect(got.unresolvedLines).toEqual([]);
    // Every line resolved, but neither was weighed on a scale: the oil came
    // from a density (0.6) and the eggs from a curated portion (0.8), so the
    // score sits between those and short of 1.
    expect(got.confidence).toBeGreaterThan(0.6);
    expect(got.confidence).toBeLessThan(0.8);
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

describe('confidence roll-up (issue #1027)', () => {
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

  it('scores `1 tbsp oil + 6 eggs` far below 1.0 when the eggs cannot be weighed', () => {
    // The exact shape `massCoverage` was blind to. With no slug the eggs have
    // no gram path, so the old metric dropped them from *both* sides of its
    // ratio and reported 1.0 on an estimate capturing ~4% of the food.
    const lines: ResolvedNutritionLine[] = [
      { quantity: 1, unit: 'tbsp', facts: OIL, densityGPerMl: 0.92, label: 'olive oil' },
      { quantity: 6, unit: 'each', facts: EGG, label: '6 eggs' },
    ];
    const got = rollUpNutrition(lines, 1);
    expect(got.confidence).toBeLessThan(0.5);
    // Density (0.6) over the one weighable line, halved by the line it could not
    // weigh at all.
    expect(got.confidence).toBeCloseTo(0.3, 5);
    expect(got.unresolvedLines).toEqual([{ label: '6 eggs', reason: 'weight' }]);
  });

  it('reports each resolution tier at its own weight', () => {
    const tier = (line: ResolvedNutritionLine) => rollUpNutrition([line], 1).confidence;
    // Mass arithmetic: no estimation at all.
    expect(tier({ quantity: 100, unit: 'g', facts: UNIT_FOOD })).toBeCloseTo(1, 5);
    // A curated per-food portion for the unit.
    expect(tier({ quantity: 2, unit: 'each', facts: EGG, slug: 'egg' })).toBeCloseTo(0.8, 5);
    // A generic density scalar applied to a volume.
    expect(tier({ quantity: 1, unit: 'cup', facts: UNIT_FOOD, densityGPerMl: 1 })).toBeCloseTo(
      0.6,
      5,
    );
    // No path at all.
    expect(tier({ quantity: 1, unit: 'splash', facts: UNIT_FOOD })).toBe(0);
  });

  it('cannot reach 1.0 while any line is unresolved', () => {
    const exact: ResolvedNutritionLine = { quantity: 500, unit: 'g', facts: UNIT_FOOD };
    expect(rollUpNutrition([exact], 1).confidence).toBe(1);
    const withUnweighable = rollUpNutrition(
      [exact, { quantity: 6, unit: 'each', facts: EGG, label: 'eggs' }],
      1,
    );
    expect(withUnweighable.confidence).toBeLessThan(1);
    expect(withUnweighable.confidence).toBeCloseTo(0.5, 5);
  });

  it('weights each line by its mass, not by the line count', () => {
    // A pinch of exactly-weighed salt must not outvote a kilo of guessed stock.
    const got = rollUpNutrition(
      [
        { quantity: 1, unit: 'g', facts: UNIT_FOOD },
        { quantity: 1000, unit: 'ml', facts: UNIT_FOOD, densityGPerMl: 1 },
      ],
      1,
    );
    expect(got.confidence).toBeCloseTo((1 * 1 + 1000 * 0.6) / 1001, 5);
    expect(got.confidence).toBeLessThan(0.61);
  });

  it('never treats an unknown weight as zero grams', () => {
    // `null` grams mean *unknown*. They contribute 0 confidence, but they must
    // not enter any mass total as if the line weighed nothing.
    const got = rollUpNutrition(
      [
        { quantity: 200, unit: 'g', facts: UNIT_FOOD },
        { quantity: 3, unit: 'sprinkle', facts: UNIT_FOOD, label: 'paprika' },
      ],
      1,
    );
    expect(got.weighableGrams).toBe(200);
    expect(got.accountedGrams).toBe(200);
    expect(got.whole.calories).toBe(200);
    expect(got.confidence).toBeCloseTo(0.5, 5);
  });

  it('keeps unresolved lines in an estimate that sources nothing at all', () => {
    const got = rollUpNutrition(
      [{ quantity: 2, unit: 'clove', facts: UNIT_FOOD, label: 'garlic' }],
      1,
    );
    expect(got.confidence).toBe(0);
    expect(got.unresolvedLines).toEqual([{ label: 'garlic', reason: 'weight' }]);
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

// The precedence ladder used to live in a `useMemo` inside
// `ingredients-panel.tsx`, so it could only be exercised by rendering a
// component. Testing the tagged union directly is the point of #1029: the
// provenance is now a value, so it is assertable without React.
describe('resolveNutritionView precedence', () => {
  const GRAPH = rollUpNutrition(
    [
      { quantity: 100, unit: 'g', facts: UNIT_FOOD },
      { quantity: 1, unit: 'each' },
    ],
    1,
  );
  const TEXT = [{ item: 'chicken', quantity: 200, unit: 'g' }];

  it('prefers the cook’s own numbers over every estimate', () => {
    const view = resolveNutritionView({
      manual: { calories: 500 },
      graph: GRAPH,
      ingredients: TEXT,
      servings: 1,
    });
    expect(view.provenance).toEqual({ source: 'manual' });
    expect(view.perServing.calories).toBe(500);
  });

  it('ignores an empty manual record and falls through to the graph', () => {
    const view = resolveNutritionView({ manual: {}, graph: GRAPH, ingredients: TEXT, servings: 1 });
    expect(view.provenance.source).toBe('graph');
  });

  it('tags the graph rung with its confidence and line counts', () => {
    const view = resolveNutritionView({ graph: GRAPH, ingredients: TEXT, servings: 1 });
    expect(view.provenance).toEqual({
      source: 'graph',
      // One exactly-weighed line, halved by the line that could not be weighed.
      confidence: 0.5,
      sourcedLines: 1,
      totalLines: 2,
      unresolvedLines: [{ label: '', reason: 'weight' }],
    });
    expect(view.perServing.calories).toBeCloseTo(100, 5);
  });

  it('falls back to the text estimate when the graph sourced nothing', () => {
    const view = resolveNutritionView({
      graph: rollUpNutrition([{ quantity: 1, unit: 'each' }], 1),
      ingredients: TEXT,
      servings: 2,
    });
    expect(view.provenance.source).toBe('estimate');
    // chicken 165 kcal/100 g × 200 g = 330, halved across 2 servings.
    expect(view.perServing.calories).toBeCloseTo(165, 5);
  });

  it('reaches the text rung with no graph input at all (unsaved draft)', () => {
    const view = resolveNutritionView({ ingredients: TEXT, servings: 1 });
    expect(view.provenance).toEqual({
      source: 'estimate',
      confidence: 1,
      sourcedLines: 1,
      totalLines: 1,
      unresolvedLines: [],
    });
  });

  it('counts a text-matched counted ingredient on the estimate rung (#1029)', () => {
    // The regression this closes: before, the text path dropped every counted
    // line, so this recipe reported only the oil's calories while the graph path
    // reported the eggs too. Same recipe, two different answers.
    const view = resolveNutritionView({
      ingredients: [
        { item: 'olive oil', quantity: 1, unit: 'tbsp' },
        { item: 'egg', quantity: 6, unit: 'each' },
      ],
      servings: 1,
    });
    expect(view.provenance).toMatchObject({ source: 'estimate', sourcedLines: 2, totalLines: 2 });
    expect(view.perServing.calories!).toBeGreaterThan(400);
  });

  it('reports `none` rather than a zeroed estimate when nothing resolves', () => {
    const view = resolveNutritionView({
      ingredients: [{ item: 'dragon fruit essence', quantity: 1, unit: 'splash' }],
      servings: 4,
    });
    expect(view).toEqual(emptyNutritionView());
    expect(view.perServing).toEqual({});
  });

  it('reports `none` for an empty input', () => {
    expect(resolveNutritionView({})).toEqual({ perServing: {}, provenance: { source: 'none' } });
  });

  it('treats a non-positive serving count as 1 on the text rung', () => {
    const zero = resolveNutritionView({ ingredients: TEXT, servings: 0 });
    const one = resolveNutritionView({ ingredients: TEXT, servings: 1 });
    expect(zero.perServing.calories).toBeCloseTo(one.perServing.calories!, 5);
  });
});
