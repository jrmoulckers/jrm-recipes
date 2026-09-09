import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getRecipeMock, updateRecipeMock } = vi.hoisted(() => ({
  getRecipeMock: vi.fn(),
  updateRecipeMock: vi.fn(),
}));

vi.mock('~/server/recipes/queries', () => ({ getRecipe: getRecipeMock }));
vi.mock('~/server/recipes/mutations', () => ({ updateRecipe: updateRecipeMock }));

import { DomainError } from '~/server/errors';
import { applyIngredientSubstitution } from './substitution-mutations';

const updatedAt = new Date('2026-09-08T12:00:00.000Z');
const recipe = {
  id: 'recipe_1',
  title: 'Cake',
  description: 'Family cake',
  coverImageUrl: null,
  coverImageAlt: 'A sliced cake',
  servings: 8,
  servingsNoun: 'slices',
  prepMinutes: 10,
  cookMinutes: 30,
  totalMinutes: 40,
  restMinutes: null,
  makeAheadNote: null,
  equipment: ['pan'],
  difficulty: 'easy',
  cuisine: null,
  sourceName: null,
  sourceUrl: null,
  notes: null,
  story: 'Saved for generations',
  handedDownFrom: null,
  originYear: null,
  originPlace: null,
  calories: null,
  proteinGrams: null,
  carbsGrams: null,
  fatGrams: null,
  saturatedFatGrams: null,
  sodiumMg: null,
  sugarGrams: null,
  fiberGrams: null,
  visibility: 'private',
  status: 'published',
  groupId: null,
  dietaryFlags: [],
  updatedAt,
  tags: [],
  sourceImages: [],
  ingredients: [
    {
      id: 'ingredient_1',
      section: null,
      quantity: 1,
      quantityMax: null,
      unit: 'cup',
      item: 'butter',
      note: null,
      prep: 'softened',
      stepPosition: 1,
      optional: false,
    },
  ],
  steps: [
    {
      section: null,
      title: 'Mix',
      instruction: 'Mix everything.',
      imageUrl: null,
      imageAlt: null,
      videoUrl: null,
      captionUrl: null,
      captionLanguage: null,
      timerSeconds: null,
      targetTempC: null,
      doneness: null,
      techniques: [],
    },
  ],
};

const input = {
  recipeId: 'recipe_1',
  ingredientId: 'ingredient_1',
  expectedItem: 'butter',
  expectedRecipeUpdatedAt: updatedAt.toISOString(),
  substitute: 'Neutral or olive oil',
};

beforeEach(() => {
  vi.clearAllMocks();
  getRecipeMock.mockResolvedValue(recipe);
  updateRecipeMock.mockResolvedValue({ id: 'recipe_1', slug: 'cake' });
});

describe('applyIngredientSubstitution', () => {
  it('preserves the full recipe and delegates the write to versioned recipe update', async () => {
    const actor = { id: 'user_1' };
    await applyIngredientSubstitution(input, actor as never);

    expect(updateRecipeMock).toHaveBeenCalledWith(
      'recipe_1',
      expect.objectContaining({
        coverImageAlt: 'A sliced cake',
        story: 'Saved for generations',
        ingredients: [
          expect.objectContaining({
            item: 'Neutral or olive oil',
            prep: 'softened',
          }),
        ],
        steps: [expect.objectContaining({ title: 'Mix' })],
      }),
      actor,
      {
        expectedUpdatedAt: updatedAt,
        ingredientIdsByPosition: [null],
      },
    );
  });

  it('rejects a stale recipe before calling the write path', async () => {
    await expect(
      applyIngredientSubstitution(
        { ...input, expectedRecipeUpdatedAt: '2026-09-08T11:59:00.000Z' },
        { id: 'user_1' } as never,
      ),
    ).rejects.toEqual(new DomainError('CONFLICT'));
    expect(updateRecipeMock).not.toHaveBeenCalled();
  });

  it('preserves ingredient identities when duplicate ingredient names exist', async () => {
    getRecipeMock.mockResolvedValueOnce({
      ...recipe,
      ingredients: [
        recipe.ingredients[0],
        {
          ...recipe.ingredients[0],
          id: 'ingredient_2',
          position: 2,
        },
      ],
    });

    await applyIngredientSubstitution(input, { id: 'user_1' } as never);

    expect(updateRecipeMock).toHaveBeenCalledWith(
      'recipe_1',
      expect.objectContaining({
        ingredients: [
          expect.objectContaining({ item: 'Neutral or olive oil' }),
          expect.objectContaining({ item: 'butter' }),
        ],
      }),
      expect.anything(),
      {
        expectedUpdatedAt: updatedAt,
        ingredientIdsByPosition: [null, 'ingredient_2'],
      },
    );
  });
});
