import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

vi.mock('server-only', () => ({}));

/**
 * Pagination unit tests for the recipe list queries (issues #57, #58). A fake
 * Drizzle surface lets us assert the SQL `limit`/`offset` we pass and the
 * `nextOffset` we derive without a real database.
 */
const { dbMock, resolveFoodIdsMock } = vi.hoisted(() => ({
  resolveFoodIdsMock: vi.fn(),
  dbMock: {
    query: {
      recipes: { findMany: vi.fn() },
      groupMembers: { findMany: vi.fn() },
      memberDietaryProfiles: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('~/server/db', () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));
vi.mock('~/server/db/resolve-food', () => ({
  resolveFoodId: vi.fn(),
  resolveFoodIds: resolveFoodIdsMock,
}));

import type { User } from '~/server/db/schema';
import { COMPOSITION_COVERED_CATEGORIES } from '~/lib/dietary-rules';
import { listLibrary, listLibraryRecipeIds, searchRecipes } from './queries';
import type { RecipeSearch } from './search';
import { LIBRARY_PAGE_SIZE } from './pagination';

const viewer = { id: 'viewer_1' } as User;

function lastFindManyArg() {
  const call = dbMock.query.recipes.findMany.mock.calls.at(-1);
  return (call?.[0] ?? {}) as {
    limit?: number;
    offset?: number;
    columns?: Record<string, boolean>;
    with?: unknown;
    where?: SQL;
  };
}

const dialect = new PgDialect({ casing: 'snake_case' });

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
  resolveFoodIdsMock.mockResolvedValue(['food_mushroom']);
});

describe('listLibrary pagination (#57)', () => {
  it('passes limit/offset to the query and defaults to the library page size', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([]);
    await listLibrary(viewer);
    const arg = lastFindManyArg();
    expect(arg.limit).toBe(LIBRARY_PAGE_SIZE);
    expect(arg.offset).toBe(0);
  });

  it('advances nextOffset by the page size when a full page comes back', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const page = await listLibrary(viewer, { limit: 2, offset: 4 });
    expect(page.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(page.nextOffset).toBe(6);
  });

  it('returns a null nextOffset for a short final page', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: 'a' }]);
    const page = await listLibrary(viewer, { limit: 2, offset: 0 });
    expect(page.nextOffset).toBeNull();
  });

  it('keeps the DB order (top-rated is sorted in SQL, not re-sorted in JS)', async () => {
    // Rows arrive already ordered by SQL. A JS re-sort would reorder these by
    // their aggregates. We assert the order is preserved.
    dbMock.query.recipes.findMany.mockResolvedValue([
      { id: 'low', ratingCount: 1, ratingSum: 1 },
      { id: 'high', ratingCount: 10, ratingSum: 50 },
    ]);
    const page = await listLibrary(viewer, { sort: 'top-rated' });
    expect(page.items.map((r) => r.id)).toEqual(['low', 'high']);
  });

  it('returns an empty page without a viewer', async () => {
    const page = await listLibrary(null);
    expect(page).toEqual({ items: [], nextOffset: null });
    expect(dbMock.query.recipes.findMany).not.toHaveBeenCalled();
  });
});

describe('listLibraryRecipeIds (#57)', () => {
  it('selects only ids with no eager relations', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const ids = await listLibraryRecipeIds(viewer);
    expect(ids).toEqual(['a', 'b']);
    const arg = lastFindManyArg();
    expect(arg.columns).toEqual({ id: true });
    expect(arg.with).toBeUndefined();
    expect(arg.limit).toBeUndefined();
  });

  it('returns [] without a viewer', async () => {
    expect(await listLibraryRecipeIds(null)).toEqual([]);
    expect(dbMock.query.recipes.findMany).not.toHaveBeenCalled();
  });
});

describe('searchRecipes pagination (#58)', () => {
  const baseSearch: RecipeSearch = {
    meals: [],
    mealMatch: 'any',
    cuisines: [],
    cuisineMatch: 'any',
    tags: [],
    tagMatch: 'all',
    diets: [],
    dietMatch: 'all',
    mine: false,
    showUncertain: false,
    sort: 'newest',
  };

  it('passes limit/offset to the query', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([]);
    await searchRecipes(viewer, { ...baseSearch }, { limit: 24, offset: 48 });
    const arg = lastFindManyArg();
    expect(arg.limit).toBe(24);
    expect(arg.offset).toBe(48);
  });

  it('returns a Paginated result with nextOffset from the raw page', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([
      { id: 'a', tags: [] },
      { id: 'b', tags: [] },
    ]);
    const page = await searchRecipes(viewer, { ...baseSearch }, { limit: 2 });
    expect(page.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(page.nextOffset).toBe(2);
  });

  it('returns a null nextOffset for a short final page', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: 'a', tags: [] }]);
    const page = await searchRecipes(viewer, { ...baseSearch }, { limit: 2 });
    expect(page.nextOffset).toBeNull();
  });

  it('fails closed when a safe-for profile is missing or unowned', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([]);
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue(null);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'missing_profile' });

    const where = lastFindManyArg().where;
    expect(where && dialect.sqlToQuery(where).sql.toLowerCase()).toContain('false');
  });

  it('requires affirmative curated coverage for blocking custom restrictions', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([]);
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'mushrooms', source: 'exact', approved: true }],
        },
      ],
    });

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const where = lastFindManyArg().where;
    const query = where ? dialect.sqlToQuery(where) : null;
    expect(query?.sql).toContain('"food_items"."source"');
    expect(query?.sql).toContain('"food_items"."category" in');
    expect(query?.params).toContain('curated');
    expect(query?.params).toEqual(expect.arrayContaining([...COMPOSITION_COVERED_CATEGORIES]));
    expect(query?.params).toContain('food_mushroom');
    expect(query?.params).toContain('profile_1');
  });

  it('pages Possible matches with an independent offset', async () => {
    dbMock.query.recipes.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'possible-a', tags: [] },
      { id: 'possible-b', tags: [] },
    ]);

    const page = await searchRecipes(
      viewer,
      { ...baseSearch, diets: ['vegan'] },
      { limit: 2, possibleOffset: 4 },
    );

    expect(lastFindManyArg().offset).toBe(4);
    expect(page.possibleItems.map((recipe) => recipe.id)).toEqual(['possible-a', 'possible-b']);
    expect(page.possibleNextOffset).toBe(6);
  });

  it('does not execute the definite lane for a Possible-only page', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: 'possible-a', tags: [] }]);

    const page = await searchRecipes(
      viewer,
      { ...baseSearch, diets: ['vegan'] },
      { limit: 2, possibleOffset: 8, lane: 'possible' },
    );

    expect(dbMock.query.recipes.findMany).toHaveBeenCalledTimes(1);
    expect(lastFindManyArg().offset).toBe(8);
    expect(page.items).toEqual([]);
    expect(page.possibleItems.map((recipe) => recipe.id)).toEqual(['possible-a']);
  });
});
