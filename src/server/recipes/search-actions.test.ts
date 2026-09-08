import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  getCurrentUserMock,
  searchRecipesMock,
  listMemberProfilesMock,
  attachCardAllergensMock,
  attachCardDietaryAssessmentViewsMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  searchRecipesMock: vi.fn(),
  listMemberProfilesMock: vi.fn(),
  attachCardAllergensMock: vi.fn(),
  attachCardDietaryAssessmentViewsMock: vi.fn(),
}));

vi.mock('~/server/auth', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('~/server/dietary/queries', () => ({
  listMemberProfiles: listMemberProfilesMock,
}));
vi.mock('~/server/dietary/presentation', () => ({
  attachCardDietaryAssessmentViews: attachCardDietaryAssessmentViewsMock,
}));
vi.mock('./queries', () => ({
  searchRecipes: searchRecipesMock,
  attachCardAllergens: attachCardAllergensMock,
}));

import { loadMorePossibleSearchAction, loadMoreSearchAction } from './search-actions';

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ id: 'viewer_1' });
  listMemberProfilesMock.mockResolvedValue([]);
  attachCardAllergensMock.mockImplementation(async (recipes) => recipes);
  attachCardDietaryAssessmentViewsMock.mockImplementation(async (recipes) => recipes);
});

describe('search pagination lanes', () => {
  it('requests and returns only the definite lane', async () => {
    searchRecipesMock.mockResolvedValue({
      items: [{ id: 'definite_1' }],
      possibleItems: [{ id: 'unused_possible' }],
      nextOffset: 48,
      possibleNextOffset: 99,
      unrankable: { protein: 0, calories: 0, carbs: 0 },
    });

    const result = await loadMoreSearchAction('diet=vegan', 24);

    expect(searchRecipesMock).toHaveBeenCalledWith(
      { id: 'viewer_1' },
      expect.objectContaining({ diets: ['vegan'] }),
      { offset: 24, lane: 'definite' },
    );
    expect(attachCardDietaryAssessmentViewsMock).toHaveBeenCalledWith(
      [{ id: 'definite_1' }],
      'viewer_1',
    );
    expect(result).toEqual({ items: [{ id: 'definite_1' }], nextOffset: 48 });
  });

  it('requests and returns only the Possible lane with its independent cursor', async () => {
    searchRecipesMock.mockResolvedValue({
      items: [{ id: 'unused_definite' }],
      possibleItems: [{ id: 'possible_1' }],
      nextOffset: 99,
      possibleNextOffset: 80,
      unrankable: { protein: 0, calories: 0, carbs: 0 },
    });

    const result = await loadMorePossibleSearchAction('diet=vegan', 60);

    expect(searchRecipesMock).toHaveBeenCalledWith(
      { id: 'viewer_1' },
      expect.objectContaining({ diets: ['vegan'] }),
      { possibleOffset: 60, lane: 'possible' },
    );
    expect(attachCardDietaryAssessmentViewsMock).toHaveBeenCalledWith(
      [{ id: 'possible_1' }],
      'viewer_1',
    );
    expect(result).toEqual({ items: [{ id: 'possible_1' }], nextOffset: 80 });
  });
});
