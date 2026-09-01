import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { state, db } = vi.hoisted(() => {
  const state = {
    finds: [] as (
      { id: string; provider: 'cloudinary'; publicId: string; bytes: number } | undefined
    )[],
    updates: 0,
    deletes: 0,
    meters: [] as Record<string, unknown>[],
  };
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(() => updateChain),
    returning: vi.fn(async () => {
      state.updates += 1;
      return [
        {
          id: 'asset-1',
          provider: 'cloudinary' as const,
          publicId: 'heirloom/shared',
          bytes: 1024 * 1024 + 1,
        },
      ];
    }),
  };
  const deleteChain = {
    where: vi.fn(async () => {
      state.deletes += 1;
    }),
  };
  const insertChain = {
    values: vi.fn((value: Record<string, unknown>) => {
      state.meters.push(value);
      return insertChain;
    }),
    onConflictDoUpdate: vi.fn(async () => undefined),
    onConflictDoNothing: vi.fn(() => insertChain),
    returning: vi.fn(async () => []),
  };
  const tx = {
    query: {
      mediaAssets: {
        findFirst: vi.fn(async () => state.finds.shift()),
      },
    },
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
    insert: vi.fn(() => insertChain),
  };
  const db = {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    query: { mediaAssets: { findMany: vi.fn(async () => []) } },
  };
  return { state, db };
});

vi.mock('~/server/db', () => ({ db }));

import { executeRetainedMediaTransfers } from './custody';

const source = {
  id: 'asset-1',
  provider: 'cloudinary' as const,
  publicId: 'heirloom/shared',
  bytes: 1024 * 1024 + 1,
};

beforeEach(() => {
  state.finds = [];
  state.updates = 0;
  state.deletes = 0;
  state.meters = [];
  vi.clearAllMocks();
});

describe('retained media custody execution', () => {
  it('moves and meters Cloudinary bytes once, while a retry is a no-op', async () => {
    state.finds = [source, undefined];
    const plan = {
      departingUserId: 'departing',
      transfers: [
        {
          assetId: source.id,
          url: 'https://res.cloudinary.com/demo/image/upload/heirloom/shared.jpg',
          publicId: source.publicId,
          resourceType: 'image' as const,
          destination: { kind: 'user' as const, userId: 'receiver' },
        },
      ],
      toUsers: 1,
      toRecipes: 0,
    };

    const first = await executeRetainedMediaTransfers(plan);
    expect(first).toMatchObject({ transferredToUsers: 1, meteredMb: 2 });
    expect(state.meters).toContainEqual(expect.objectContaining({ ownerId: 'receiver', value: 2 }));

    state.finds = [undefined, source];
    const retry = await executeRetainedMediaTransfers(plan);
    expect(retry).toMatchObject({ transferredToUsers: 0, meteredMb: 0 });
    expect(state.meters).toHaveLength(1);
  });

  it('converges destination duplicates without metering or deleting bytes', async () => {
    state.finds = [source, { ...source, id: 'existing' }];
    const result = await executeRetainedMediaTransfers({
      departingUserId: 'departing',
      transfers: [
        {
          assetId: source.id,
          url: 'https://res.cloudinary.com/demo/image/upload/heirloom/shared.jpg',
          publicId: source.publicId,
          resourceType: 'image',
          destination: { kind: 'user', userId: 'receiver' },
        },
      ],
      toUsers: 1,
      toRecipes: 0,
    });

    expect(result.convergedDuplicates).toBe(1);
    expect(state.deletes).toBe(1);
    expect(state.updates).toBe(0);
    expect(state.meters).toEqual([]);
  });

  it('does not delete a source row another execution already moved', async () => {
    state.finds = [source, source];
    const result = await executeRetainedMediaTransfers({
      departingUserId: 'departing',
      transfers: [
        {
          assetId: source.id,
          url: 'https://res.cloudinary.com/demo/image/upload/heirloom/shared.jpg',
          publicId: source.publicId,
          resourceType: 'image',
          destination: { kind: 'user', userId: 'receiver' },
        },
      ],
      toUsers: 1,
      toRecipes: 0,
    });

    expect(result.convergedDuplicates).toBe(0);
    expect(state.deletes).toBe(0);
    expect(state.updates).toBe(0);
  });

  it('converges duplicate bookkeeping at a recipe custodian', async () => {
    state.finds = [source, { ...source, id: 'existing' }];
    const result = await executeRetainedMediaTransfers({
      departingUserId: 'departing',
      transfers: [
        {
          assetId: source.id,
          url: 'https://res.cloudinary.com/demo/image/upload/heirloom/shared.jpg',
          publicId: source.publicId,
          resourceType: 'image',
          destination: { kind: 'recipe', recipeId: 'retained-recipe' },
        },
      ],
      toUsers: 0,
      toRecipes: 1,
    });

    expect(result.convergedDuplicates).toBe(1);
    expect(state.deletes).toBe(1);
    expect(state.updates).toBe(0);
  });
});
