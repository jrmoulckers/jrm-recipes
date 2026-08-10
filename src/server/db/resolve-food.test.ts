import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { dbMock, state } = vi.hoisted(() => ({
  dbMock: { select: vi.fn() },
  state: {
    configured: true,
    aliasRows: [] as unknown[],
    itemRows: [] as unknown[],
    throwOn: null as null | 'select',
  },
}));

vi.mock('~/server/db', () => ({
  db: dbMock,
  isDbConfigured: () => state.configured,
}));

import { foodAliases } from '~/server/db/schema';
import { foodNodeId } from '~/lib/food-db';
import { resolveFoodId, resolveFoodIds } from './resolve-food';

beforeEach(() => {
  state.configured = true;
  state.aliasRows = [];
  state.itemRows = [];
  state.throwOn = null;
  dbMock.select.mockReset();
  // A minimal chainable stand-in: `.from(table)` records which table so
  // `.where()` (the awaited terminal) can resolve the matching fixture rows.
  dbMock.select.mockImplementation(() => {
    if (state.throwOn === 'select') throw new Error('boom');
    let table: unknown;
    const chain = {
      from(t: unknown) {
        table = t;
        return chain;
      },
      where() {
        return Promise.resolve(table === foodAliases ? state.aliasRows : state.itemRows);
      },
    };
    return chain;
  });
});

describe('resolveFoodIds', () => {
  it('returns all null without touching the db when unconfigured', async () => {
    state.configured = false;
    await expect(resolveFoodIds(['2 tbsp kosher salt'])).resolves.toEqual([null]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('returns [] for an empty input', async () => {
    await expect(resolveFoodIds([])).resolves.toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('resolves an exact alias match without a verification query', async () => {
    state.aliasRows = [{ alias: '2 tbsp kosher salt', foodId: 'food_salt', useCount: 4 }];
    // Alias foodIds are FK-backed, so no existence check should run for them.
    state.itemRows = [];
    await expect(resolveFoodIds(['2 Tbsp Kosher Salt'])).resolves.toEqual(['food_salt']);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('falls back to the curated dataset when no alias matches', async () => {
    const garlic = foodNodeId('Garlic');
    state.aliasRows = [];
    state.itemRows = [{ id: garlic }];
    await expect(resolveFoodIds(['2 cloves garlic, minced'])).resolves.toEqual([garlic]);
  });

  it("nulls out a candidate whose node isn't present (FK safety)", async () => {
    state.aliasRows = [];
    state.itemRows = []; // curated fallback id exists nowhere in this db
    await expect(resolveFoodIds(['2 cloves garlic, minced'])).resolves.toEqual([null]);
  });

  it('returns null for an unresolvable line without a second query', async () => {
    state.aliasRows = [];
    await expect(resolveFoodIds(['qwerty zxcvb nonsense'])).resolves.toEqual([null]);
    // Only the alias lookup runs. No existence check when there are no candidates.
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('never throws. A db error resolves everything to null', async () => {
    state.throwOn = 'select';
    await expect(resolveFoodIds(['2 tbsp kosher salt', 'garlic'])).resolves.toEqual([null, null]);
  });
});

describe('resolveFoodId (singular)', () => {
  it('resolves one item', async () => {
    state.aliasRows = [{ alias: '2 tbsp kosher salt', foodId: 'food_salt', useCount: 4 }];
    state.itemRows = [{ id: 'food_salt' }];
    await expect(resolveFoodId('2 tbsp kosher salt')).resolves.toBe('food_salt');
  });
});
