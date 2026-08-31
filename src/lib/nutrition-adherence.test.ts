import { describe, expect, it } from 'vitest';

import type { EffectiveNutritionTarget } from './nutrition-targets';
import type { RecipeNutritionView } from './recipe-nutrition';
import {
  buildNutritionAdherence,
  type DatedRollUpItem,
  type NutritionTargetsByProfileAndDate,
} from './nutrition-adherence';

function target(id: string, effectiveFrom: string, calories: number): EffectiveNutritionTarget {
  return {
    id,
    profileId: 'member-1',
    effectiveFrom,
    targets: { calories },
  };
}

function item(date: string, calories: number, view?: RecipeNutritionView): DatedRollUpItem {
  return {
    id: `meal-${date}`,
    title: `Meal ${date}`,
    context: date,
    servings: 1,
    date,
    view: view ?? { perServing: { calories }, provenance: { source: 'manual' } },
  };
}

function targetMatrix(
  rows: Record<string, EffectiveNutritionTarget | null>,
): NutritionTargetsByProfileAndDate {
  return new Map([['member-1', new Map(Object.entries(rows))]]);
}

describe('buildNutritionAdherence', () => {
  it('splits a period at a target boundary and scores each daily average independently', () => {
    const oldTarget = target('old', '2026-01-01', 2000);
    const newTarget = target('new', '2026-02-01', 1500);
    const adherence = buildNutritionAdherence(
      [item('2026-01-30', 2000), item('2026-02-01', 1500)],
      ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'],
      [{ id: 'member-1', name: 'Avery' }],
      targetMatrix({
        '2026-01-30': oldTarget,
        '2026-01-31': oldTarget,
        '2026-02-01': newTarget,
        '2026-02-02': newTarget,
      }),
    )[0]!;

    expect(adherence.segments).toHaveLength(2);
    expect(adherence.segments[0]).toMatchObject({
      startDate: '2026-01-30',
      endDate: '2026-01-31',
      dayCount: 2,
      target: { id: 'old' },
    });
    expect(adherence.segments[0]!.comparisons[0]).toMatchObject({
      actual: 1000,
      target: 2000,
      percent: 50,
    });
    expect(adherence.segments[1]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      dayCount: 2,
      target: { id: 'new' },
    });
    expect(adherence.segments[1]!.comparisons[0]).toMatchObject({
      actual: 750,
      target: 1500,
      percent: 50,
    });
  });

  it('keeps a missing target absent rather than manufacturing a zero', () => {
    const segment = buildNutritionAdherence(
      [item('2026-01-01', 500)],
      ['2026-01-01'],
      [{ id: 'member-1', name: 'Avery' }],
      targetMatrix({ '2026-01-01': null }),
    )[0]!.segments[0]!;

    expect(segment.target).toBeNull();
    expect(segment.comparisons).toEqual([]);
  });

  it('carries confidence and named unresolved context on the adherence segment', () => {
    const uncertain: RecipeNutritionView = {
      perServing: { calories: 500 },
      provenance: {
        source: 'graph',
        confidence: 0.5,
        sourcedLines: 1,
        totalLines: 2,
        unresolvedLines: [{ label: '1 bunch parsley', reason: 'weight' }],
      },
    };
    const current = target('current', '2026-01-01', 2000);
    const segment = buildNutritionAdherence(
      [item('2026-01-01', 500, uncertain)],
      ['2026-01-01'],
      [{ id: 'member-1', name: 'Avery' }],
      targetMatrix({ '2026-01-01': current }),
    )[0]!.segments[0]!;

    expect(segment.rollUp.confidence).toBe(0.5);
    expect(segment.rollUp.unresolved).toEqual([
      {
        label: '1 bunch parsley',
        reason: 'weight',
        meal: '2026-01-01 · Meal 2026-01-01',
      },
    ]);
    expect(segment.comparisons[0]).toMatchObject({ percent: 25 });
  });
});
