import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { assessmentFindMany, ingredientWhere, ingredientRows, listForViewer, recipeFindMany } =
  vi.hoisted(() => {
    const assessmentFindMany = vi.fn();
    const ingredientRows = vi.fn();
    const ingredientWhere = vi.fn(() => ingredientRows());
    return {
      assessmentFindMany,
      ingredientWhere,
      ingredientRows,
      listForViewer: vi.fn(),
      recipeFindMany: vi.fn(),
    };
  });

vi.mock('~/server/db', () => {
  const executor = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: ingredientWhere }),
      }),
    }),
    query: {
      dietaryAssessments: { findMany: assessmentFindMany },
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
  listDietaryAssessmentsForViewer: listForViewer,
}));

import {
  attachCardDietaryData,
  listAuthorizedRecipeDietaryAssessmentViews,
  listRecipeDietaryAssessmentViews,
} from './presentation';
import { dietaryIngredientFingerprint } from '~/lib/dietary-fingerprint';

const currentFingerprint = dietaryIngredientFingerprint([
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
]);

beforeEach(() => {
  vi.clearAllMocks();
  ingredientRows.mockResolvedValue([
    {
      id: 'ingredient_1',
      recipeId: 'recipe_1',
      name: 'milk',
      amount: null,
      amountMax: null,
      unit: null,
      prep: null,
      foodId: null,
      foodSlug: null,
      foodCategory: null,
      foodAllergens: null,
    },
    {
      id: 'ingredient_2',
      recipeId: 'recipe_1',
      name: 'salt',
      amount: null,
      amountMax: null,
      unit: null,
      prep: null,
      foodId: null,
      foodSlug: null,
      foodCategory: null,
      foodAllergens: null,
    },
  ]);
  assessmentFindMany.mockResolvedValue([]);
  recipeFindMany.mockResolvedValue([{ id: 'recipe_1', dietaryFlags: [] }]);
  listForViewer.mockResolvedValue([]);
});

describe('listRecipeDietaryAssessmentViews', () => {
  it('keeps a deterministic conflict ahead of a weaker positive source', async () => {
    assessmentFindMany.mockResolvedValue([
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        ruleId: 'allergen:dairy',
        source: 'author-confirmed',
        verdict: 'meets',
        confidence: null,
        ingredientFingerprint: currentFingerprint,
        evidence: [],
      },
      {
        recipeId: 'recipe_1',
        scope: 'canonical',
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        ingredientFingerprint: currentFingerprint,
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
    assessmentFindMany.mockResolvedValue([
      {
        recipeId: 'recipe_1',
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        ingredientFingerprint: currentFingerprint,
        evidence: [
          { ingredientId: 'ingredient_1', finding: 'present' },
          { ingredientId: 'ingredient_2', finding: 'absent' },
        ],
      },
    ]);

    const [recipe] = await attachCardDietaryData([{ id: 'recipe_1' }]);
    expect(recipe?.dietary.assessments).toEqual([
      expect.objectContaining({
        recognizedIngredients: 2,
        totalIngredients: 2,
        attentionIngredients: [{ ingredientId: 'ingredient_1', name: 'milk', kind: 'conflict' }],
      }),
    ]);
  });

  it('drops persisted assessments whose ingredient fingerprint is stale', async () => {
    assessmentFindMany.mockResolvedValue([
      {
        recipeId: 'recipe_1',
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'meets',
        confidence: 'high',
        ingredientFingerprint: 'i1.stale',
        evidence: [],
      },
    ]);

    const [recipe] = await attachCardDietaryData([{ id: 'recipe_1' }]);
    expect(recipe?.dietary.assessments).toEqual([]);
  });

  it('uses canonical conflict precedence for an authorized share-token projection', async () => {
    assessmentFindMany.mockResolvedValue([
      {
        recipeId: 'recipe_1',
        ruleId: 'allergen:dairy',
        source: 'deterministic',
        verdict: 'conflicts',
        confidence: 'high',
        ingredientFingerprint: currentFingerprint,
        evidence: [{ ingredientId: 'ingredient_1', finding: 'present' }],
      },
    ]);

    await expect(listAuthorizedRecipeDietaryAssessmentViews('recipe_1')).resolves.toEqual([
      expect.objectContaining({
        ruleId: 'allergen:dairy',
        verdict: 'conflicts',
      }),
    ]);
  });
});
