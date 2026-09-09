import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getCurrentUserMock, searchRecipesMock, attachCardDietaryDataMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  searchRecipesMock: vi.fn(),
  attachCardDietaryDataMock: vi.fn(),
}));

vi.mock('~/server/auth', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('~/server/dietary/presentation', () => ({
  attachCardDietaryData: attachCardDietaryDataMock,
}));
vi.mock('./queries', () => ({
  searchRecipes: searchRecipesMock,
}));

import { loadMorePossibleSearchAction, loadMoreSearchAction } from './search-actions';

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ id: 'viewer_1' });
  attachCardDietaryDataMock.mockImplementation(async (recipes) => recipes);
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
    expect(attachCardDietaryDataMock).toHaveBeenCalledWith([{ id: 'definite_1' }], 'viewer_1');
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
    expect(attachCardDietaryDataMock).toHaveBeenCalledWith([{ id: 'possible_1' }], 'viewer_1');
    expect(result).toEqual({ items: [{ id: 'possible_1' }], nextOffset: 80 });
  });
});
