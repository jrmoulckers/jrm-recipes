import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { revalidatePathMock, findManyMock, creatorsFindManyMock, isDbConfiguredMock } = vi.hoisted(
  () => ({
    revalidatePathMock: vi.fn(),
    findManyMock: vi.fn(),
    creatorsFindManyMock: vi.fn(),
    isDbConfiguredMock: vi.fn(() => true),
  }),
);

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('~/server/db', () => ({
  db: {
    query: {
      recipes: { findMany: findManyMock },
      recipeCreators: { findMany: creatorsFindManyMock },
    },
  },
  isDbConfigured: isDbConfiguredMock,
}));

import { revalidateRecipePaths, revalidateRecipeSlugPaths } from './revalidate';

beforeEach(() => {
  vi.clearAllMocks();
  isDbConfiguredMock.mockReturnValue(true);
  findManyMock.mockResolvedValue([]);
  creatorsFindManyMock.mockResolvedValue([]);
});

describe('revalidateRecipePaths', () => {
  it('busts both the canonical and the legacy flat path', async () => {
    await revalidateRecipePaths({
      id: 'rec_1',
      slug: 'apple-pie',
      cook: 'ada',
    });

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      '/recipes/ada/apple-pie',
      '/recipes/apple-pie',
    ]);
  });

  it('busts a single path when the cook slug is unknown', async () => {
    await revalidateRecipePaths({ id: 'rec_1', slug: 'apple-pie' });

    expect(revalidatePathMock.mock.calls.flat()).toEqual(['/recipes/apple-pie']);
  });

  it("busts every accepted co-creator's path too (issue #668)", async () => {
    // Each creator namespace is a separately cached document. Busting only the
    // owner's would leave a co-creator's page serving stale content.
    creatorsFindManyMock.mockResolvedValue([
      { slug: 'apple-pie', user: { slug: 'bo' } },
      { slug: 'apple-pie-2ab', user: { slug: 'cy' } },
    ]);

    await revalidateRecipePaths({
      id: 'rec_1',
      slug: 'apple-pie',
      cook: 'ada',
    });

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      '/recipes/ada/apple-pie',
      '/recipes/apple-pie',
      '/recipes/bo/apple-pie',
      '/recipes/cy/apple-pie-2ab',
    ]);
  });

  it('skips a creator with no slug or no user slug', async () => {
    // A pending row holds no slug, and a user with no namespace has no path.
    // Emitting either would produce a broken revalidation target.
    creatorsFindManyMock.mockResolvedValue([
      { slug: null, user: { slug: 'bo' } },
      { slug: 'apple-pie', user: { slug: null } },
      { slug: 'apple-pie', user: null },
    ]);

    await revalidateRecipePaths({
      id: 'rec_1',
      slug: 'apple-pie',
      cook: 'ada',
    });

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      '/recipes/ada/apple-pie',
      '/recipes/apple-pie',
    ]);
  });

  it("busts an already-removed creator's path when passed explicitly", async () => {
    // The revoked row is gone, so it can't be discovered — yet purging it is
    // the cache half of revocation. Without this the ex-creator's page keeps
    // being served after their access was withdrawn.
    creatorsFindManyMock.mockResolvedValue([]);

    await revalidateRecipePaths({ id: 'rec_1', slug: 'apple-pie', cook: 'ada' }, [
      { cook: 'bo', slug: 'apple-pie' },
    ]);

    expect(revalidatePathMock.mock.calls.flat()).toContain('/recipes/bo/apple-pie');
  });

  it('does not query for creators without a database', async () => {
    isDbConfiguredMock.mockReturnValue(false);

    await revalidateRecipePaths({
      id: 'rec_1',
      slug: 'apple-pie',
      cook: 'ada',
    });

    expect(creatorsFindManyMock).not.toHaveBeenCalled();
    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      '/recipes/ada/apple-pie',
      '/recipes/apple-pie',
    ]);
  });
});

describe('revalidateRecipeSlugPaths', () => {
  it('busts the canonical path of every namespace holding the slug', async () => {
    // Slugs are unique per cook, so one slug can name several recipes. Missing
    // the right owner would leave that page stale, so all of them are busted.
    findManyMock.mockResolvedValue([
      { id: 'rec_1', slug: 'apple-pie', author: { slug: 'ada' } },
      { id: 'rec_2', slug: 'apple-pie', author: { slug: 'bo' } },
    ]);

    await revalidateRecipeSlugPaths('apple-pie');

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      '/recipes/apple-pie',
      '/recipes/ada/apple-pie',
      '/recipes/apple-pie',
      '/recipes/bo/apple-pie',
      '/recipes/apple-pie',
    ]);
  });

  it('also finds a recipe whose slug is held by a co-creator (issue #668)', async () => {
    // The slug may name nothing in `recipes` and still be live in someone's
    // namespace as a creator entry. Searching only `recipes` would miss it.
    creatorsFindManyMock.mockResolvedValue([
      {
        id: 'rc_1',
        recipe: {
          id: 'rec_9',
          slug: 'sunday-ragu',
          deletedAt: null,
          author: { slug: 'ada' },
        },
      },
    ]);

    await revalidateRecipeSlugPaths('apple-pie');

    expect(revalidatePathMock.mock.calls.flat()).toContain('/recipes/ada/sunday-ragu');
  });

  it('ignores a co-creator entry on a soft-deleted recipe', async () => {
    creatorsFindManyMock.mockResolvedValue([
      {
        id: 'rc_1',
        recipe: {
          id: 'rec_9',
          slug: 'sunday-ragu',
          deletedAt: new Date(),
          author: { slug: 'ada' },
        },
      },
    ]);

    await revalidateRecipeSlugPaths('apple-pie');

    expect(revalidatePathMock.mock.calls.flat()).toEqual(['/recipes/apple-pie']);
  });

  it('still busts the legacy path without a database', async () => {
    isDbConfiguredMock.mockReturnValue(false);

    await revalidateRecipeSlugPaths('apple-pie');

    expect(revalidatePathMock.mock.calls.flat()).toEqual(['/recipes/apple-pie']);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
