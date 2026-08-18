import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Proves the invalidation half of the cache's write strategy actually fires
 * (issue #1044, ADR-0007), using the `recordingTx` harness style from
 * `mutations-food-link.test.ts` — no database.
 *
 * Two orderings are load-bearing and both are asserted here:
 *
 *  - the **delete happens inside the write transaction**, so the stale row can
 *    never outlive the edit that invalidated it;
 *  - the **refresh happens after the transaction resolves**, so a recompute
 *    never extends the lock and a failed recompute degrades to a miss rather
 *    than rolling the save back.
 */

vi.mock('server-only', () => ({}));

const { dbMock, resolveMock, refreshMock, timeline } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
  resolveMock: vi.fn(),
  refreshMock: vi.fn(),
  timeline: [] as string[],
}));

vi.mock('~/server/db', () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

vi.mock('~/server/db/resolve-food', () => ({
  resolveFoodIds: resolveMock,
}));

vi.mock('./nutrition', () => ({
  refreshRecipeNutritionCache: refreshMock,
}));

import {
  recipeNutritionCache,
  recipes,
  recipeEvents,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  tags,
  type User,
} from '~/server/db/schema';
import { recipeInput } from './validation';
import { createRecipe, updateRecipe } from './mutations';

const author = { id: 'user_1' } as User;

function chainable(result: unknown) {
  return {
    returning: vi.fn(() => Promise.resolve(result)),
    onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
}

function keyOf(table: unknown): string {
  switch (table) {
    case recipes:
      return 'recipes';
    case recipeIngredients:
      return 'recipeIngredients';
    case recipeSteps:
      return 'recipeSteps';
    case tags:
      return 'tags';
    case recipeTags:
      return 'recipeTags';
    case recipeEvents:
      return 'recipeEvents';
    case recipeVersions:
      return 'recipeVersions';
    case recipeNutritionCache:
      return 'recipeNutritionCache';
    default:
      return 'unknown';
  }
}

/** Records the tables written and deleted, in order, inside the transaction. */
function recordingTx(existing?: Record<string, unknown>) {
  const deletes: string[] = [];
  const insertOrder: string[] = [];

  const tx: Record<string, unknown> = {
    query: {
      groupMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipes: { findFirst: vi.fn().mockResolvedValue(existing) },
      recipeSlugAliases: { findFirst: vi.fn().mockResolvedValue(undefined) },
      recipeCreators: { findFirst: vi.fn().mockResolvedValue(undefined) },
      tags: { findMany: vi.fn(() => Promise.resolve([])) },
    },
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn((table: unknown) => ({
      values: (_vals: unknown) => {
        const key = keyOf(table);
        insertOrder.push(key);
        return chainable(key === 'recipes' ? [{ id: 'r1', slug: 'apple-pie' }] : undefined);
      },
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    })),
    delete: vi.fn((table: unknown) => {
      deletes.push(keyOf(table));
      timeline.push(`delete:${keyOf(table)}`);
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ next: 1 }])),
      })),
    })),
  };
  tx.transaction = (cb: (t: unknown) => unknown) => cb(tx);
  return { tx, deletes, insertOrder };
}

const ingredients = [{ item: '2 cloves garlic, minced' }];

const existingRecipe = {
  id: 'r1',
  slug: 'apple-pie',
  publishedAt: null,
  status: 'draft',
  visibility: 'private',
  authorId: author.id,
};

beforeEach(() => {
  dbMock.transaction.mockReset();
  resolveMock.mockReset();
  refreshMock.mockReset();
  timeline.length = 0;
  resolveMock.mockImplementation((items: string[]) => Promise.resolve(items.map(() => null)));
  refreshMock.mockImplementation(() => {
    timeline.push('refresh');
    return Promise.resolve(undefined);
  });
});

/** Runs `cb` as the transaction body and marks the commit on the timeline. */
function runTransaction(tx: unknown) {
  dbMock.transaction.mockImplementation(async (cb: (t: unknown) => unknown) => {
    const out = await cb(tx);
    timeline.push('commit');
    return out;
  });
}

describe('a recipe save invalidates the cached nutrition inside its transaction', () => {
  it('deletes the cached row on update', async () => {
    const { tx, deletes } = recordingTx(existingRecipe);
    runTransaction(tx);

    await updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie', ingredients }), author);

    expect(deletes).toContain('recipeNutritionCache');
  });

  it('deletes it before the transaction commits, not after', async () => {
    const { tx } = recordingTx(existingRecipe);
    runTransaction(tx);

    await updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie', ingredients }), author);

    expect(timeline.indexOf('delete:recipeNutritionCache')).toBeLessThan(
      timeline.indexOf('commit'),
    );
  });

  it('refreshes only after the commit, never inside it', async () => {
    const { tx } = recordingTx(existingRecipe);
    runTransaction(tx);

    await updateRecipe('r1', recipeInput.parse({ title: 'Apple Pie', ingredients }), author);

    expect(refreshMock).toHaveBeenCalledWith('r1');
    expect(timeline.indexOf('commit')).toBeLessThan(timeline.indexOf('refresh'));
  });

  it('warms a newly created recipe after its commit', async () => {
    // Create needs no invalidation — the id is new, so there is nothing stale to
    // delete — but it does need the refresh, or every first view of a new recipe
    // pays for a full resolve.
    const { tx } = recordingTx();
    runTransaction(tx);

    await createRecipe(recipeInput.parse({ title: 'Apple Pie', ingredients }), author);

    expect(refreshMock).toHaveBeenCalledWith('r1');
    expect(timeline.indexOf('commit')).toBeLessThan(timeline.indexOf('refresh'));
  });
});
