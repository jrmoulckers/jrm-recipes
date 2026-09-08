import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { dbMock, ingredientWhere } = vi.hoisted(() => {
  const ingredientWhere = vi.fn().mockResolvedValue([]);
  return {
    ingredientWhere,
    dbMock: {
      query: {
        recipes: { findMany: vi.fn() },
        recipeCreators: { findMany: vi.fn() },
        groupMembers: { findMany: vi.fn() },
        memberDietaryProfiles: { findMany: vi.fn() },
        customDietaryRestrictions: { findMany: vi.fn() },
        dietaryAssessments: { findMany: vi.fn() },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({ where: ingredientWhere })),
        })),
      })),
    },
  };
});

vi.mock('~/server/db', () => ({ db: dbMock }));

import { loadDietaryAssessmentReadBatch } from './assessments';

const recipeIds = Array.from({ length: 120 }, (_, index) => `recipe_${index}`);

beforeEach(() => {
  vi.clearAllMocks();
  ingredientWhere.mockResolvedValue([]);
  dbMock.query.recipes.findMany.mockResolvedValue(
    recipeIds.map((id) => ({
      id,
      authorId: 'viewer_1',
      visibility: 'private',
      groupId: null,
    })),
  );
  dbMock.query.recipeCreators.findMany.mockResolvedValue([]);
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
  dbMock.query.memberDietaryProfiles.findMany.mockResolvedValue([{ id: 'profile_1' }]);
  dbMock.query.customDietaryRestrictions.findMany.mockResolvedValue([]);
  dbMock.query.dietaryAssessments.findMany.mockResolvedValue([]);
});

describe('loadDietaryAssessmentReadBatch', () => {
  it('loads a signed-in 120-card result set with a fixed seven queries', async () => {
    const batch = await loadDietaryAssessmentReadBatch(recipeIds, 'viewer_1');

    expect(batch.ingredientsByRecipeId.size).toBe(120);
    expect(batch.assessmentsByRecipeId.size).toBe(120);
    expect(dbMock.query.recipes.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.recipeCreators.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.groupMembers.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.memberDietaryProfiles.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.customDietaryRestrictions.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.dietaryAssessments.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('uses only access, ingredient, and assessment queries for public cards', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue(
      recipeIds.map((id) => ({
        id,
        authorId: 'author_1',
        visibility: 'public',
        groupId: null,
      })),
    );

    await loadDietaryAssessmentReadBatch(recipeIds, null);

    expect(dbMock.query.recipes.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.query.dietaryAssessments.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(dbMock.query.recipeCreators.findMany).not.toHaveBeenCalled();
    expect(dbMock.query.groupMembers.findMany).not.toHaveBeenCalled();
    expect(dbMock.query.memberDietaryProfiles.findMany).not.toHaveBeenCalled();
    expect(dbMock.query.customDietaryRestrictions.findMany).not.toHaveBeenCalled();
  });

  it('fails before loading dietary data when any requested recipe is unauthorized', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([
      {
        id: 'private_recipe',
        authorId: 'someone_else',
        visibility: 'private',
        groupId: null,
      },
    ]);

    await expect(
      loadDietaryAssessmentReadBatch(['private_recipe'], 'viewer_1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.query.memberDietaryProfiles.findMany).not.toHaveBeenCalled();
    expect(dbMock.query.customDietaryRestrictions.findMany).not.toHaveBeenCalled();
    expect(dbMock.query.dietaryAssessments.findMany).not.toHaveBeenCalled();
  });
});
