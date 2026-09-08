import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

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
import { FOOD_ALLERGENS } from '~/lib/food-allergens';
import { FOOD_ITEMS } from '~/lib/food-db';
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
    where?: unknown;
  };
}

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
    expect(page.nextOffset).toBeNull();
    expect(dbMock.query.recipes.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not execute the Possible lane for a definite-only page', async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: 'definite-a', tags: [] }]);

    const page = await searchRecipes(
      viewer,
      { ...baseSearch, diets: ['vegan'] },
      { limit: 2, offset: 6, lane: 'definite' },
    );

    expect(dbMock.query.recipes.findMany).toHaveBeenCalledTimes(1);
    expect(lastFindManyArg().offset).toBe(6);
    expect(page.items.map((recipe) => recipe.id)).toEqual(['definite-a']);
    expect(page.possibleItems).toEqual([]);
    expect(page.possibleNextOffset).toBeNull();
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
    expect(page.nextOffset).toBeNull();
    expect(page.possibleItems.map((recipe) => recipe.id)).toEqual(['possible-a']);
    expect(page.possibleNextOffset).toBeNull();
  });

  it('admits a non-empty recipe through complete curated food coverage', async () => {
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'mushroom', source: 'exact', approved: true }],
        },
      ],
    });
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toContain(
      'and (exists (select 1 from "recipe_ingredients" where "recipe_ingredients"."recipe_id" = "recipes"."id") and not exists',
    );
    expect(rendered.sql).toContain('"food_items"."source"');
    expect(rendered.sql).toContain('"food_items"."category" in');
    expect(rendered.params).toContain('curated');
    expect(rendered.params).toEqual(expect.arrayContaining([...COMPOSITION_COVERED_CATEGORIES]));
    expect(rendered.params).toContain('food_mushroom');
    expect(rendered.params).toContain('profile_1');
    expect(rendered.params).toContain('meets');
    expect(rendered.params).toContain('high');
    expect(resolveFoodIdsMock).toHaveBeenCalledWith(['mushroom']);
  });

  it('rejects unresolved ingredients outside complete assessment or curated food coverage', async () => {
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'mushroom', source: 'exact', approved: true }],
        },
      ],
    });
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toContain('from "dietary_evidence"');
    expect(rendered.sql).toMatch(
      /not exists \(select .* from "recipe_ingredients".*not exists \(select .* from "dietary_evidence"/,
    );
    expect(rendered.sql).toMatch(
      /not exists \(select .* from "recipe_ingredients".*not exists \(select .* from "food_items"/,
    );
    expect(rendered.params).toContain('absent');
  });

  it('excludes a matching medical restriction before accepting structured coverage', async () => {
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'mushroom', source: 'exact', approved: true }],
        },
      ],
    });
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toContain('position(');
    expect(rendered.sql).not.toContain(' like ');
    expect(rendered.params).toContain(' mushroom ');
    expect(rendered.sql).toContain('"food_items"."parent_id"');
    expect(rendered.params).toContain('food_mushroom');
    expect(rendered.params).toContain('conflicts');
  });

  it('vetoes opaque compounds carrying the restricted built-in allergen', async () => {
    expect(FOOD_ALLERGENS['soy-sauce']).toContain('wheat');
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'wheat', source: 'exact', approved: true }],
        },
      ],
    });
    resolveFoodIdsMock.mockResolvedValue(['food_wheat']);
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toContain('"food_items"."allergens" @>');
    expect(rendered.params).toContain('{"wheat"}');
  });

  it('leaves opaque ingredients without explicit allergen facts unresolved', async () => {
    expect(FOOD_ITEMS.find((food) => food.name === 'Stock / broth')?.category).toBe('liquid');
    expect(COMPOSITION_COVERED_CATEGORIES).not.toContain('liquid');
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'milk', source: 'exact', approved: true }],
        },
      ],
    });
    resolveFoodIdsMock.mockResolvedValue(['food_milk']);
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toMatch(
      /"food_items"\."category" in \([^)]+\) or "food_items"\."allergens" is not null/,
    );
    expect(rendered.params).not.toContain('liquid');
    expect(rendered.params).toContain('{"dairy"}');
  });

  it('uses whole-token matching so egg does not conflict with eggplant', async () => {
    expect(FOOD_ITEMS.find((food) => food.name === 'Eggplant')?.category).toBe('produce-whole');
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: 'egg', source: 'exact', approved: true }],
        },
      ],
    });
    resolveFoodIdsMock.mockResolvedValue(['food_egg']);
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toContain('position(');
    expect(rendered.sql).not.toContain(' like ');
    expect(rendered.params).toContain(' egg ');
    expect(rendered.params).not.toContain('%egg%');
    expect(rendered.params).toContain('produce-whole');
  });

  it('normalizes literal percent and underscore characters instead of treating them as wildcards', async () => {
    dbMock.query.memberDietaryProfiles.findFirst.mockResolvedValue({
      id: 'profile_1',
      allergens: [],
      diets: [],
      customRestrictions: [
        {
          id: 'restriction_1',
          severity: 'allergy-intolerance',
          terms: [{ term: '50%_cream', source: 'exact', approved: true }],
        },
      ],
    });
    resolveFoodIdsMock.mockResolvedValue([null]);
    dbMock.query.recipes.findMany.mockResolvedValue([]);

    await searchRecipes(viewer, { ...baseSearch, safeFor: 'profile_1' });

    const rendered = new PgDialect({ casing: 'snake_case' }).sqlToQuery(
      lastFindManyArg().where as SQL,
    );
    expect(rendered.sql).toContain('position(');
    expect(rendered.sql).not.toContain(' like ');
    expect(rendered.params).toContain(' 50 cream ');
    expect(rendered.params).not.toContain('50%_cream');
  });
});
