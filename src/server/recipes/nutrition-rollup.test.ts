import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EffectiveNutritionTarget } from '~/lib/nutrition-targets';

const { getRecipeNutritionViews, getNutritionTargetsOn } = vi.hoisted(() => ({
  getRecipeNutritionViews: vi.fn(),
  getNutritionTargetsOn: vi.fn(),
}));

vi.mock('./nutrition', () => ({ getRecipeNutritionViews }));
vi.mock('~/server/dietary/targets', () => ({ getNutritionTargetsOn }));

import { rollUpMealNutritionWithTargets, type RollUpMeal } from './nutrition-rollup';

describe('rollUpMealNutritionWithTargets batching', () => {
  beforeEach(() => {
    getRecipeNutritionViews.mockReset().mockResolvedValue(
      new Map([
        ['recipe-1', { perServing: { calories: 500 }, provenance: { source: 'manual' } }],
        ['recipe-2', { perServing: { calories: 700 }, provenance: { source: 'manual' } }],
      ]),
    );

    const oldTarget: EffectiveNutritionTarget = {
      id: 'old',
      profileId: 'member-1',
      effectiveFrom: '2026-01-01',
      targets: { calories: 2000 },
    };
    const newTarget: EffectiveNutritionTarget = {
      id: 'new',
      profileId: 'member-1',
      effectiveFrom: '2026-01-03',
      targets: { calories: 1800 },
    };
    getNutritionTargetsOn.mockResolvedValue(
      new Map<string, Map<string, EffectiveNutritionTarget | null>>([
        [
          'member-1',
          new Map([
            ['2026-01-01', oldTarget],
            ['2026-01-02', oldTarget],
            ['2026-01-03', newTarget],
          ]),
        ],
        [
          'member-2',
          new Map([
            ['2026-01-01', null],
            ['2026-01-02', null],
            ['2026-01-03', null],
          ]),
        ],
      ]),
    );
  });

  it('loads recipes and all member/date targets once for the whole period', async () => {
    const meals: RollUpMeal[] = [
      {
        id: 'meal-1',
        recipeId: 'recipe-1',
        title: 'Soup',
        context: 'Thursday dinner',
        servings: 1,
        date: '2026-01-01',
      },
      {
        id: 'meal-2',
        recipeId: 'recipe-2',
        title: 'Pie',
        context: 'Friday dinner',
        servings: 1,
        date: '2026-01-02',
      },
      {
        id: 'meal-3',
        recipeId: 'recipe-1',
        title: 'Soup',
        context: 'Saturday lunch',
        servings: 1,
        date: '2026-01-03',
      },
    ];

    const result = await rollUpMealNutritionWithTargets({
      meals,
      periodDates: meals.map((meal) => meal.date),
      members: [
        { id: 'member-1', name: 'Avery' },
        { id: 'member-2', name: 'Sam' },
      ],
      userId: 'owner-1',
    });

    expect(getRecipeNutritionViews).toHaveBeenCalledTimes(1);
    expect(getRecipeNutritionViews).toHaveBeenCalledWith(['recipe-1', 'recipe-2', 'recipe-1']);
    expect(getNutritionTargetsOn).toHaveBeenCalledTimes(1);
    expect(getNutritionTargetsOn).toHaveBeenCalledWith(
      ['member-1', 'member-2'],
      ['2026-01-01', '2026-01-02', '2026-01-03'],
      { userId: 'owner-1' },
    );
    expect(result.rollUp.total.calories).toBe(1700);
    expect(result.adherence[0]!.segments).toHaveLength(2);
    expect(result.adherence[1]!.segments[0]!.target).toBeNull();
  });
});
