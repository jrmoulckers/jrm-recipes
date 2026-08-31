import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pins the cache-busting of the rating actions (#215): a rating change re-ranks
 * the cached public "top-rated" feed, so both actions must revalidate the
 * public-recipes tag, not just the recipe's own detail path. Auth and the
 * underlying mutations are mocked so we exercise only the action's revalidation.
 */

const {
  revalidatePathMock,
  updateTagMock,
  requireUserMock,
  setRatingMock,
  removeRatingMock,
  findManyMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  updateTagMock: vi.fn(),
  requireUserMock: vi.fn(),
  setRatingMock: vi.fn(),
  removeRatingMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  updateTag: updateTagMock,
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
}));
vi.mock('~/server/auth', () => ({ requireUser: requireUserMock }));
vi.mock('~/server/db', () => ({
  isDbConfigured: () => true,
  db: {
    query: {
      recipes: { findMany: findManyMock },
      // Path fan-out now discovers co-creator namespaces too (issue #668).
      recipeCreators: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
}));
vi.mock('./mutations', () => ({
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  removeRating: removeRatingMock,
  resolveComment: vi.fn(),
  applySuggestion: vi.fn(),
  setRating: setRatingMock,
}));

import { removeRatingAction, setRatingAction } from './actions';
import { PUBLIC_RECIPES_TAG } from '../recipes/cache';

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: 'user_1' });
  setRatingMock.mockResolvedValue(undefined);
  removeRatingMock.mockResolvedValue(undefined);
  findManyMock.mockResolvedValue([{ id: 'rec_1', slug: 'apple-pie', author: { slug: 'ada' } }]);
});

describe('setRatingAction revalidation', () => {
  it('busts the public feed tag and the recipe detail path', async () => {
    const res = await setRatingAction({
      recipeId: 'rec_1',
      recipeSlug: 'apple-pie',
      value: 5,
    });

    expect(res).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes/apple-pie');
    // A recipe also answers on its canonical namespaced URL, cached
    // independently by the App Router, so both have to be busted (#666).
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes/ada/apple-pie');
    expect(updateTagMock).toHaveBeenCalledWith(PUBLIC_RECIPES_TAG);
  });

  it('does not revalidate when the rating fails to persist', async () => {
    setRatingMock.mockRejectedValue(new Error('NOT_FOUND'));

    const res = await setRatingAction({
      recipeId: 'rec_1',
      recipeSlug: 'apple-pie',
      value: 5,
    });

    expect(res.ok).toBe(false);
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});

describe('removeRatingAction revalidation', () => {
  it('busts the public feed tag and the recipe detail path', async () => {
    const res = await removeRatingAction({
      recipeId: 'rec_1',
      recipeSlug: 'apple-pie',
    });

    expect(res).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes/apple-pie');
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes/ada/apple-pie');
    expect(updateTagMock).toHaveBeenCalledWith(PUBLIC_RECIPES_TAG);
  });

  it('does not revalidate when the removal fails', async () => {
    removeRatingMock.mockRejectedValue(new Error('FORBIDDEN'));

    const res = await removeRatingAction({
      recipeId: 'rec_1',
      recipeSlug: 'apple-pie',
    });

    expect(res.ok).toBe(false);
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});
