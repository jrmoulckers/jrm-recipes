import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { loadReadBatch, recipeFindMany } = vi.hoisted(() => ({
  loadReadBatch: vi.fn(),
  recipeFindMany: vi.fn(),
}));

vi.mock('~/server/db', () => {
  const executor = {
    query: {
      recipes: { findMany: recipeFindMany },
    },
  };
  return {
    isDbConfigured: () => true,
    db: {
      ...executor,
      transaction: (callback: (tx: typeof executor) => unknown) => callback(executor),
    },
  };
});

vi.mock('./assessments', () => ({
  loadDietaryAssessmentReadBatch: loadReadBatch,
}));

import {
  attachCardDietaryData,
  listAuthorizedRecipeDietaryAssessmentViews,
  listRecipeDietaryAssessmentViews,
} from './presentation';
const dietaryIngredients = [
  {
    ingredientId: 'ingredient_1',
    item: 'milk',
    amount: null,
    amountMax: null,
    unit: null,
    prep: null,
    linkedFood: null,
  },
  {
    ingredientId: 'ingredient_2',
    item: 'salt',
    amount: null,
    amountMax: null,
    unit: null,
    prep: null,
    linkedFood: null,
  },
];

function mockAssessmentRows(rows: unknown[]) {
  loadReadBatch.mockResolvedValue({
    ingredientsByRecipeId: new Map([['recipe_1', dietaryIngredients]]),
    assessmentsByRecipeId: new Map([['recipe_1', rows]]),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssessmentRows([]);
  recipeFindMany.mockResolvedValue([{ id: 'recipe_1', dietaryFlags: [] }]);
});

describe('listRecipeDietaryAssessmentViews', () => {
  it('keeps a deterministic conflict ahead of a weaker positive source', async () => {
    mockAssessmentRows([
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'author-confirmed',
        verdict: 'meets',
        confidence: null,
        evidence: [],
      },
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        evidence: [{ ingredientId: 'ingredient_1', finding: 'present' }],
      },
    ]);

    await expect(listRecipeDietaryAssessmentViews('recipe_1', 'user_1')).resolves.toEqual([
      expect.objectContaining({
        ruleId: 'allergen:dairy',
        verdict: 'conflicts',
        attentionIngredients: [{ ingredientId: 'ingredient_1', name: 'milk', kind: 'conflict' }],
      }),
    ]);
    expect(loadReadBatch).toHaveBeenCalledWith(['recipe_1'], 'user_1', {});
  });
});

describe('attachCardDietaryData', () => {
  it('projects author declarations into assessment views', async () => {
    recipeFindMany.mockResolvedValue([{ id: 'recipe_1', dietaryFlags: ['dairy-free'] }]);
    const [recipe] = await attachCardDietaryData([
      { id: 'recipe_1', dietaryFlags: ['dairy-free'] },
    ]);
    expect(recipe?.dietary.assessments).toEqual([
      expect.objectContaining({
        ruleId: 'allergen:dairy',
        source: 'author-confirmed',
        verdict: 'meets',
        confidence: null,
      }),
    ]);
  });

  it('maps persisted evidence to recognized and attention ingredients', async () => {
    mockAssessmentRows([
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        evidence: [
          { ingredientId: 'ingredient_1', finding: 'present' },
          { ingredientId: 'ingredient_2', finding: 'absent' },
        ],
      },
    ]);

    const [recipe] = await attachCardDietaryData([{ id: 'recipe_1' }], 'user_1');
    expect(recipe?.dietary.assessments).toEqual([
      expect.objectContaining({
        recognizedIngredients: 2,
        totalIngredients: 2,
        attentionIngredients: [{ ingredientId: 'ingredient_1', name: 'milk', kind: 'conflict' }],
      }),
    ]);
  });

  it('uses ingredient corrections instead of superseded inferred evidence', async () => {
    mockAssessmentRows([
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'meets',
        confidence: 'high',
        evidence: [
          { ingredientId: 'ingredient_1', finding: 'present', source: 'text-match' },
          {
            ingredientId: 'ingredient_1',
            finding: 'absent',
            source: 'ingredient-correction',
          },
          { ingredientId: 'ingredient_2', finding: 'absent', source: 'text-match' },
        ],
      },
    ]);

    const [recipe] = await attachCardDietaryData([{ id: 'recipe_1' }], 'user_1');
    expect(recipe?.dietary.assessments).toEqual([
      expect.objectContaining({
        recognizedIngredients: 2,
        attentionIngredients: [],
      }),
    ]);
  });

  it('does not serialize private-confidence rows for anonymous cards', async () => {
    mockAssessmentRows([
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'meets',
        confidence: 'medium',
        evidence: [],
      },
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:egg',
        source: 'deterministic',
        verdict: 'unknown',
        confidence: 'needs-review',
        evidence: [{ ingredientId: 'ingredient_1', finding: 'unresolved' }],
      },
    ]);

    const [recipe] = await attachCardDietaryData([{ id: 'recipe_1' }]);
    expect(recipe?.dietary.assessments).toEqual([]);
    expect(recipe?.dietary.ingredients).toEqual([]);
  });

  it('retains authorized personal assessment rows for signed-in cards', async () => {
    mockAssessmentRows([
      {
        recipeId: 'recipe_1',
        scope: 'personal',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'on-device',
        verdict: 'meets',
        confidence: 'medium',
        evidence: [{ ingredientId: 'ingredient_1', finding: 'possible' }],
      },
    ]);

    const [recipe] = await attachCardDietaryData([{ id: 'recipe_1' }], 'user_1');
    expect(recipe?.dietary.assessments).toEqual([
      expect.objectContaining({
        scope: 'personal',
        ruleId: 'allergen:dairy',
        confidence: 'medium',
      }),
    ]);
    expect(recipe?.dietary.ingredients).toHaveLength(2);
  });

  it('uses canonical conflict precedence for an authorized share-token projection', async () => {
    mockAssessmentRows([
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        profileId: null,
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        evidence: [{ ingredientId: 'ingredient_1', finding: 'present' }],
      },
    ]);

    await expect(
      listAuthorizedRecipeDietaryAssessmentViews('recipe_1', 'share-token'),
    ).resolves.toEqual([
      expect.objectContaining({
        ruleId: 'allergen:dairy',
        verdict: 'conflicts',
      }),
    ]);
    expect(loadReadBatch).toHaveBeenCalledWith(['recipe_1'], null, {
      shareToken: 'share-token',
    });
  });
});
