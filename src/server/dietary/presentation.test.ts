import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { loadDietaryAssessmentReadBatchMock } = vi.hoisted(() => ({
  loadDietaryAssessmentReadBatchMock: vi.fn(),
}));

vi.mock('./assessments', () => ({
  loadDietaryAssessmentReadBatch: loadDietaryAssessmentReadBatchMock,
}));

import { attachCardDietaryAssessmentViews } from './presentation';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attachCardDietaryAssessmentViews', () => {
  it('loads and projects the full card set through one batch call', async () => {
    const recipes = Array.from({ length: 120 }, (_, index) => ({ id: `recipe_${index}` }));
    loadDietaryAssessmentReadBatchMock.mockResolvedValue({
      ingredientsByRecipeId: new Map([
        [
          'recipe_0',
          [
            {
              ingredientId: 'ingredient_1',
              item: 'rice',
              amount: null,
              amountMax: null,
              unit: null,
              prep: null,
              linkedFood: null,
            },
          ],
        ],
      ]),
      assessmentsByRecipeId: new Map([
        [
          'recipe_0',
          [
            {
              ruleId: 'allergen:wheat',
              scope: 'canonical',
              profileId: null,
              source: 'deterministic',
              verdict: 'meets',
              confidence: 'high',
              evidence: [
                {
                  ingredientId: 'ingredient_1',
                  finding: 'absent',
                },
              ],
            },
          ],
        ],
      ]),
    });

    const result = await attachCardDietaryAssessmentViews(recipes, 'viewer_1');

    expect(loadDietaryAssessmentReadBatchMock).toHaveBeenCalledTimes(1);
    expect(loadDietaryAssessmentReadBatchMock).toHaveBeenCalledWith(
      recipes.map((recipe) => recipe.id),
      'viewer_1',
    );
    expect(result[0]?.dietaryAssessments).toEqual([
      expect.objectContaining({
        ruleId: 'allergen:wheat',
        recognizedIngredients: 1,
        totalIngredients: 1,
        evidence: [
          {
            ingredientId: 'ingredient_1',
            ingredient: 'rice',
            finding: 'absent',
          },
        ],
      }),
    ]);
    expect(result[119]?.dietaryAssessments).toEqual([]);
  });
});
