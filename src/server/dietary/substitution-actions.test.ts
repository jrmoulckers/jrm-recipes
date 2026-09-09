import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { applyMock, requireUserMock, revalidatePathMock, revalidateRecipePathsMock } = vi.hoisted(
  () => ({
    applyMock: vi.fn(),
    requireUserMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    revalidateRecipePathsMock: vi.fn(),
  }),
);

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('~/server/auth', () => ({ requireUser: requireUserMock }));
vi.mock('~/server/db', () => ({ isDbConfigured: () => true }));
vi.mock('~/server/rate-limit', () => ({
  checkRateLimit: () => ({ ok: true }),
  RATE_LIMITED_MESSAGE: 'Slow down.',
}));
vi.mock('~/server/recipes/revalidate', () => ({
  revalidateRecipePaths: revalidateRecipePathsMock,
  revalidateRecipeTags: vi.fn(),
}));
vi.mock('./substitution-mutations', () => ({
  applyIngredientSubstitution: applyMock,
}));

import { DomainError } from '~/server/errors';
import { applyIngredientSubstitutionAction } from './substitution-actions';

const input = {
  recipeId: 'recipe_1',
  ingredientId: 'ingredient_1',
  expectedItem: 'butter',
  expectedRecipeUpdatedAt: '2026-09-08T12:00:00.000Z',
  substitute: 'Neutral or olive oil',
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: 'user_1' });
  applyMock.mockResolvedValue({
    slug: 'cake',
    cook: 'jules',
    authorId: 'user_1',
  });
});

describe('applyIngredientSubstitutionAction', () => {
  it('delegates authorization, history, and recalculation to the recipe write path', async () => {
    await expect(applyIngredientSubstitutionAction(input)).resolves.toEqual({
      ok: true,
      updatedItem: 'Neutral or olive oil',
    });
    expect(applyMock).toHaveBeenCalledWith(input, { id: 'user_1' });
    expect(revalidateRecipePathsMock).toHaveBeenCalledWith({
      id: 'recipe_1',
      slug: 'cake',
      cook: 'jules',
      authorId: 'user_1',
    });
  });

  it('returns a recoverable stale-input error', async () => {
    applyMock.mockRejectedValueOnce(new DomainError('CONFLICT'));

    await expect(applyIngredientSubstitutionAction(input)).resolves.toEqual({
      ok: false,
      error: 'This recipe changed since you opened it. Refresh and review the swap again.',
    });
  });
});
