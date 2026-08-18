import { describe, expect, it } from 'vitest';

import {
  aggregateRollUpConfidence,
  averageRollUp,
  emptyNutritionRollUp,
  hasRollUp,
  mealConfidence,
  rollUpNutritionViews,
  type RollUpItem,
} from './nutrition-rollup';
import type { RecipeNutritionView } from './recipe-nutrition';

function graphView(
  calories: number,
  confidence: number,
  unresolved: { label: string; reason: 'weight' | 'facts' }[] = [],
): RecipeNutritionView {
  return {
    perServing: { calories, proteinGrams: 10 },
    provenance: {
      source: 'graph',
      confidence,
      sourcedLines: 1,
      totalLines: 1 + unresolved.length,
      unresolvedLines: unresolved,
    },
  };
}

function manualView(calories: number): RecipeNutritionView {
  return { perServing: { calories, proteinGrams: 20 }, provenance: { source: 'manual' } };
}

const noneView: RecipeNutritionView = { perServing: {}, provenance: { source: 'none' } };

function item(id: string, view: RecipeNutritionView, servings = 1): RollUpItem {
  return { id, title: `Recipe ${id}`, context: `Day ${id}`, servings, view };
}

describe('mealConfidence', () => {
  it('treats the cook\u2019s own numbers as certain', () => {
    expect(mealConfidence({ source: 'manual' })).toBe(1);
  });

  it('is zero for a meal that resolved to nothing', () => {
    expect(mealConfidence({ source: 'none' })).toBe(0);
  });

  it('clamps a nonsense confidence into range', () => {
    expect(
      mealConfidence({
        source: 'graph',
        confidence: 4,
        sourcedLines: 1,
        totalLines: 1,
        unresolvedLines: [],
      }),
    ).toBe(1);
    expect(
      mealConfidence({
        source: 'estimate',
        confidence: Number.NaN,
        sourcedLines: 1,
        totalLines: 1,
        unresolvedLines: [],
      }),
    ).toBe(0);
  });
});

describe('aggregateRollUpConfidence', () => {
  it('is 0 for no meals', () => {
    expect(aggregateRollUpConfidence([])).toBe(0);
  });

  it('is 1 when every meal is fully confident', () => {
    expect(
      aggregateRollUpConfidence([
        { energy: 500, confidence: 1 },
        { energy: 900, confidence: 1 },
      ]),
    ).toBe(1);
  });

  it('does not let a badly-resolved meal hide behind its own understated calories', () => {
    // The failure mode this function exists for: the one meal we know least
    // about reports almost no calories *because* it resolved almost nothing, so
    // a calorie-weighted average weights it at nothing.
    const entries = [
      ...Array.from({ length: 9 }, () => ({ energy: 500, confidence: 1 })),
      { energy: 50, confidence: 0.1 },
    ];

    const weightedAverage =
      entries.reduce((sum, e) => sum + e.energy * e.confidence, 0) /
      entries.reduce((sum, e) => sum + e.energy, 0);
    expect(weightedAverage).toBeGreaterThan(0.99);

    // Captured 4550 kcal of an implied 5000.
    expect(aggregateRollUpConfidence(entries)).toBeCloseTo(0.91, 2);
  });

  it('keeps a small unreliable meal from dominating the week', () => {
    // The mirror image: an unweighable garnish is genuinely a rounding error,
    // and a plain average would report 0.55 for a week that is 99% exact.
    const entries = [
      { energy: 2000, confidence: 1 },
      { energy: 5, confidence: 0.1 },
    ];
    expect(aggregateRollUpConfidence(entries)).toBeGreaterThan(0.95);

    const plainAverage = (1 + 0.1) / 2;
    expect(plainAverage).toBeCloseTo(0.55, 2);
  });

  it('dilutes by count for meals that produced nothing at all', () => {
    // Three exact meals and one that resolved to nothing is at best 3/4.
    const entries = [
      { energy: 500, confidence: 1 },
      { energy: 500, confidence: 1 },
      { energy: 500, confidence: 1 },
      { energy: null, confidence: 0 },
    ];
    expect(aggregateRollUpConfidence(entries)).toBeCloseTo(0.75, 5);
  });

  it('falls back to an unweighted mean when nothing carries energy', () => {
    const entries = [
      { energy: 0, confidence: 0.8 },
      { energy: 0, confidence: 0.6 },
    ];
    expect(aggregateRollUpConfidence(entries)).toBeCloseTo(0.7, 5);
  });

  it('is 0 when no meal could be counted', () => {
    expect(
      aggregateRollUpConfidence([
        { energy: null, confidence: 0 },
        { energy: 100, confidence: 0 },
      ]),
    ).toBe(0);
  });

  it('ignores a negative or non-finite energy rather than trusting it', () => {
    expect(
      aggregateRollUpConfidence([
        { energy: -100, confidence: 1 },
        { energy: 500, confidence: 1 },
      ]),
    ).toBeCloseTo(0.5, 5);
  });
});

describe('rollUpNutritionViews', () => {
  it('is empty for no meals', () => {
    expect(rollUpNutritionViews([])).toEqual(emptyNutritionRollUp());
    expect(hasRollUp(emptyNutritionRollUp())).toBe(false);
  });

  it('sums per-serving nutrition by servings', () => {
    const rollUp = rollUpNutritionViews([
      item('a', graphView(400, 1), 2),
      item('b', manualView(300), 3),
    ]);
    expect(rollUp.total.calories).toBe(400 * 2 + 300 * 3);
    expect(rollUp.total.proteinGrams).toBe(10 * 2 + 20 * 3);
    expect(rollUp.servings).toBe(5);
    expect(rollUp.countedMeals).toBe(2);
    expect(hasRollUp(rollUp)).toBe(true);
  });

  it('treats an unusable serving count as one serving rather than dropping the meal', () => {
    const rollUp = rollUpNutritionViews([item('a', graphView(400, 1), 0)]);
    expect(rollUp.total.calories).toBe(400);
    expect(rollUp.servings).toBe(1);
  });

  it('leaves a nutrient absent when no meal carried it', () => {
    const rollUp = rollUpNutritionViews([item('a', graphView(400, 1))]);
    expect(rollUp.total.calories).toBe(400);
    expect('sodiumMg' in rollUp.total).toBe(false);
  });

  it('counts a meal that resolved to nothing, and names it', () => {
    const rollUp = rollUpNutritionViews([item('a', graphView(500, 1)), item('b', noneView)]);
    expect(rollUp.mealCount).toBe(2);
    expect(rollUp.countedMeals).toBe(1);
    expect(rollUp.sources.none).toBe(1);
    expect(rollUp.missingMeals).toEqual([{ id: 'b', meal: 'Day b · Recipe b' }]);
    // Counted for the total, but the missing meal still halves the confidence.
    expect(rollUp.confidence).toBeCloseTo(0.5, 5);
  });

  it('carries unresolved lines up with the meal they came from', () => {
    const rollUp = rollUpNutritionViews([
      item('a', graphView(500, 0.6, [{ label: '6 eggs', reason: 'weight' }])),
      item('b', graphView(500, 0.9, [{ label: 'saffron', reason: 'facts' }])),
    ]);
    expect(rollUp.unresolved).toEqual([
      { label: '6 eggs', reason: 'weight', meal: 'Day a · Recipe a' },
      { label: 'saffron', reason: 'facts', meal: 'Day b · Recipe b' },
    ]);
  });

  it('drops an unnamed unresolved line rather than showing a blank', () => {
    const rollUp = rollUpNutritionViews([
      item('a', graphView(500, 0.6, [{ label: '   ', reason: 'weight' }])),
    ]);
    expect(rollUp.unresolved).toEqual([]);
  });

  it('records the provenance mix', () => {
    const rollUp = rollUpNutritionViews([
      item('a', manualView(300)),
      item('b', graphView(400, 0.8)),
      item('c', noneView),
    ]);
    expect(rollUp.sources).toEqual({ manual: 1, graph: 1, estimate: 0, none: 1 });
  });
});

describe('averageRollUp', () => {
  it('divides a total into parts', () => {
    expect(averageRollUp({ calories: 14000, proteinGrams: 700 }, 7)).toEqual({
      calories: 2000,
      proteinGrams: 100,
    });
  });

  it('treats a nonsense divisor as one', () => {
    expect(averageRollUp({ calories: 100 }, 0)).toEqual({ calories: 100 });
    expect(averageRollUp({ calories: 100 }, Number.NaN)).toEqual({ calories: 100 });
  });
});
