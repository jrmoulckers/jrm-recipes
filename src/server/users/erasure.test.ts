import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, db, purge, custody, retentionApi, envMock } = vi.hoisted(() => {
  const emptyRetention = () => ({
    ownedRecipeIds: [] as string[],
    ownedToDeleteIds: [] as string[],
    ownedToUnclaimIds: [] as string[],
    ownerlessToDeleteIds: [] as string[],
    retainedCoCreatedRecipeIds: [] as string[],
    retainedRecipes: [] as {
      recipeId: string;
      ownerId: string | null;
      createdAt: Date;
      wasOwnedByDepartingUser: boolean;
    }[],
  });
  const state = {
    configured: true,
    user: undefined as { id: string; clerkId: string | null; email: string | null } | undefined,
    calls: [] as string[],
    selects: [] as unknown[][],
    returning: new Map<string, unknown[][]>(),
    inserted: null as Record<string, unknown> | null,
    purgeFailed: [] as string[],
    retention: emptyRetention(),
    mediaTransferResult: {
      transferredToUsers: 0,
      transferredToRecipes: 0,
      convergedDuplicates: 0,
      meteredMb: 0,
    },
  };

  const table = (value: unknown) =>
    (value as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] ?? 'unknown';
  const makeChain = (verb: string, value: unknown) => {
    const key = `${verb} ${table(value)}`;
    const chain = {
      set: vi.fn(() => chain),
      values: vi.fn((row: Record<string, unknown>) => {
        state.inserted = row;
        return chain;
      }),
      onConflictDoNothing: vi.fn(async () => undefined),
      where: vi.fn(() => chain),
      returning: vi.fn(async () => {
        state.calls.push(key);
        return state.returning.get(key)?.shift() ?? [{ id: 'x' }];
      }),
    };
    return chain;
  };
  const selectChain = () => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(async () => state.selects.shift() ?? []),
      then: (resolve: (value: unknown) => unknown) => resolve(state.selects.shift() ?? []),
    };
    return chain;
  };
  const db = {
    query: { users: { findFirst: vi.fn(async () => state.user) } },
    select: vi.fn(() => selectChain()),
    insert: vi.fn((value: unknown) => makeChain('insert', value)),
    update: vi.fn((value: unknown) => makeChain('update', value)),
    delete: vi.fn((value: unknown) => makeChain('delete', value)),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      state.calls.push('BEGIN');
      await fn(db);
      state.calls.push('COMMIT');
    }),
  };
  const purge = {
    purgeUserMedia: vi.fn(async () => {
      state.calls.push('purge cloudinary');
      return { purged: 3, failed: state.purgeFailed, skippedExternal: 0 };
    }),
    isPurgeComplete: (result: { failed: string[] }) => result.failed.length === 0,
    deleteUserMediaRows: vi.fn(async () => {
      state.calls.push('delete media_assets');
      return 3;
    }),
    purgeRecipeCustodiedMedia: vi.fn(async () => ({
      purged: 0,
      failed: [],
      skippedExternal: 0,
    })),
  };
  const custody = {
    planRetainedMediaTransfers: vi.fn(async () => ({
      departingUserId: 'u1',
      transfers: [],
      toUsers: 0,
      toRecipes: 0,
    })),
    executeRetainedMediaTransfersInTransaction: vi.fn(async () => {
      state.calls.push('transfer media custody');
      return state.mediaTransferResult;
    }),
  };
  const retentionApi = {
    planAccountRecipeRetention: vi.fn(async () => state.retention),
  };
  return {
    state,
    db,
    purge,
    custody,
    retentionApi,
    envMock: { env: { DELETION_HASH_SALT: 'a-sufficiently-long-salt' } },
  };
});

vi.mock('~/server/db', () => ({ db, isDbConfigured: () => state.configured }));
vi.mock('~/server/media/purge', () => purge);
vi.mock('~/server/media/custody', () => custody);
vi.mock('~/server/users/recipe-retention', () => retentionApi);
vi.mock('~/env', () => envMock);

import { eraseUserAccount, hashDeletionSubject } from './erasure';

function queueCoreSelects(retainedVersionCount?: number) {
  state.selects = [
    ...(retainedVersionCount == null ? [] : [[{ value: retainedVersionCount }]]),
    [], // ratings on other recipes
    [], // comments by the user
    [], // post-transaction user assertion
    [], // post-transaction recipe assertion
  ];
}

beforeEach(() => {
  state.configured = true;
  state.user = { id: 'u1', clerkId: 'clerk_1', email: 'nonna@example.com' };
  state.calls = [];
  state.selects = [];
  state.returning = new Map();
  state.inserted = null;
  state.purgeFailed = [];
  state.retention = {
    ownedRecipeIds: [],
    ownedToDeleteIds: [],
    ownedToUnclaimIds: [],
    ownerlessToDeleteIds: [],
    retainedCoCreatedRecipeIds: [],
    retainedRecipes: [],
  };
  state.mediaTransferResult = {
    transferredToUsers: 0,
    transferredToRecipes: 0,
    convergedDuplicates: 0,
    meteredMb: 0,
  };
  vi.clearAllMocks();
});

describe('eraseUserAccount', () => {
  it('transfers retained custody before purging remaining media', async () => {
    queueCoreSelects();
    await eraseUserAccount('u1', { trigger: 'in_app' });

    expect(state.calls.indexOf('transfer media custody')).toBeLessThan(
      state.calls.indexOf('purge cloudinary'),
    );
    expect(state.calls.indexOf('purge cloudinary')).toBeLessThan(
      state.calls.indexOf('delete users'),
    );
  });

  it('retains shared versions and makes an owned shared recipe unclaimed', async () => {
    state.retention = {
      ownedRecipeIds: ['r1'],
      ownedToDeleteIds: [],
      ownedToUnclaimIds: ['r1'],
      ownerlessToDeleteIds: [],
      retainedCoCreatedRecipeIds: [],
      retainedRecipes: [
        {
          recipeId: 'r1',
          ownerId: null,
          createdAt: new Date('2020-01-01'),
          wasOwnedByDepartingUser: true,
        },
      ],
    };
    state.returning.set('update recipes', [[{ id: 'r1' }], []]);
    queueCoreSelects(2);

    const result = await eraseUserAccount('u1', { trigger: 'in_app' });

    expect(result.unclaimedRecipeCount).toBe(1);
    expect(result.retainedVersionCount).toBe(2);
    expect(state.calls).not.toContain('delete recipe_versions');
    expect(state.calls).not.toContain('delete recipe_events');
    expect(state.calls.indexOf('update recipes')).toBeLessThan(state.calls.indexOf('delete users'));
  });

  it('deletes solely owned recipes before the user row', async () => {
    state.retention = {
      ...state.retention,
      ownedRecipeIds: ['r1'],
      ownedToDeleteIds: ['r1'],
    };
    queueCoreSelects();
    await eraseUserAccount('u1', { trigger: 'in_app' });

    expect(state.calls.indexOf('delete recipes')).toBeLessThan(state.calls.indexOf('delete users'));
  });

  it('soft-deletes an ownerless non-public recipe whose last creator departs', async () => {
    state.retention = {
      ...state.retention,
      ownerlessToDeleteIds: ['r9'],
    };
    queueCoreSelects();
    await eraseUserAccount('u1', { trigger: 'in_app' });

    expect(state.calls).toContain('update recipes');
    expect(state.calls).not.toContain('delete recipes');
  });

  it('refuses the database deletion when remote media survives', async () => {
    state.purgeFailed = ['heirloom/a1'];
    await expect(eraseUserAccount('u1', { trigger: 'clerk_webhook' })).rejects.toThrow(
      /MEDIA_PURGE_INCOMPLETE/,
    );
    expect(state.calls).toContain('BEGIN');
    expect(state.calls).not.toContain('COMMIT');
    expect(state.calls).not.toContain('delete users');
  });

  it('is a no-op for an already-erased subject', async () => {
    state.user = undefined;
    const result = await eraseUserAccount('u1', { trigger: 'clerk_webhook' });
    expect(result.status).toBe('erased');
    expect(result.counts).toEqual({});
    expect(state.calls).toEqual([]);
  });

  it('writes retained-content evidence without raw identifiers', async () => {
    state.mediaTransferResult = {
      transferredToUsers: 1,
      transferredToRecipes: 1,
      convergedDuplicates: 1,
      meteredMb: 1,
    };
    queueCoreSelects();
    await eraseUserAccount('u1', { trigger: 'in_app', noticeVersion: 'profile-delete-v2' });

    expect(state.inserted).toMatchObject({
      retainedRecipeCount: 0,
      unclaimedRecipeCount: 0,
      retainedVersionCount: 0,
      transferredAssetCount: 3,
      purgedAssetCount: 3,
      noticeVersion: 'profile-delete-v2',
    });
    const serialized = JSON.stringify(state.inserted);
    expect(serialized).not.toContain('u1');
    expect(serialized).not.toContain('clerk_1');
    expect(serialized).not.toContain('nonna@example.com');
  });

  it('keeps recipe event and version attribution set-null', () => {
    const schema = readFileSync(
      join(resolve(dirname(fileURLToPath(import.meta.url)), '../db/schema'), 'recipes.ts'),
      'utf8',
    ).replace(/'/g, '"');
    for (const declaration of ['recipeEvents', 'recipeVersions']) {
      const start = schema.indexOf(`export const ${declaration}`);
      const next = schema.indexOf('\nexport const ', start + 1);
      const body = schema.slice(start, next === -1 ? undefined : next);
      const attribution = /(actorId|authorId):\s*fk\(\)[\s\S]*?onDelete:\s*"([\w ]+)"/.exec(body);
      expect(attribution?.[2]).toBe('set null');
    }
  });
});

describe('hashDeletionSubject', () => {
  it('is deterministic and salt-dependent', () => {
    expect(hashDeletionSubject('u1')).toBe(hashDeletionSubject('u1'));
    expect(hashDeletionSubject('u1', 'salt-one-long-enough')).not.toBe(
      hashDeletionSubject('u1', 'salt-two-long-enough'),
    );
  });
});
