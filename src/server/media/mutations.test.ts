import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaAsset, User } from '~/server/db/schema';

const URL_A = 'https://res.cloudinary.com/demo/image/upload/a.jpg';

const { state, db, cloudinary, usage } = vi.hoisted(() => {
  const state = {
    configured: true,
    /** Row returned by the ownership / idempotence lookup. */
    existing: undefined as Partial<MediaAsset> | undefined,
    inserted: null as Record<string, unknown> | null,
    updated: null as Record<string, unknown> | null,
    destroyResult: { result: 'ok' },
    destroyCalls: [] as string[],
  };

  const insertChain = {
    values: vi.fn((v: Record<string, unknown>) => {
      state.inserted = v;
      return insertChain;
    }),
    returning: vi.fn(async () => [{ id: 'm1', ...state.inserted }]),
  };

  const updateChain = {
    set: vi.fn((v: Record<string, unknown>) => {
      state.updated = v;
      return updateChain;
    }),
    where: vi.fn(() => updateChain),
    returning: vi.fn(async () => [{ id: 'm1', ...state.updated }]),
    // Awaiting the chain without `.returning()` resolves like a plain update.
    then: (resolve: (v: unknown) => unknown) => resolve(undefined),
  };

  const db = {
    query: {
      mediaAssets: {
        findFirst: vi.fn(async () => state.existing),
      },
    },
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
  };

  const cloudinary = {
    config: vi.fn(),
    uploader: {
      destroy: vi.fn(async (publicId: string) => {
        state.destroyCalls.push(publicId);
        return state.destroyResult;
      }),
    },
  };

  const usage = {
    incrementUsage: vi.fn(async () => undefined),
    decrementUsage: vi.fn(async () => undefined),
  };

  return { state, db, cloudinary, usage };
});

vi.mock('~/server/db', () => ({
  db,
  isDbConfigured: () => state.configured,
}));

vi.mock('cloudinary', () => ({ v2: cloudinary }));

vi.mock('~/server/billing/usage', () => usage);

vi.mock('~/env', () => ({
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'demo',
    NEXT_PUBLIC_CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
  },
}));

import { deleteAsset, recordUpload, updateAltText } from './mutations';

const user = { id: 'u1' } as unknown as User;
const other = { id: 'u2' } as unknown as User;

beforeEach(() => {
  state.configured = true;
  state.existing = undefined;
  state.inserted = null;
  state.updated = null;
  state.destroyResult = { result: 'ok' };
  state.destroyCalls = [];
  vi.clearAllMocks();
});

describe('recordUpload', () => {
  it('inserts a cloudinary asset and meters its storage', async () => {
    await recordUpload({ url: URL_A, publicId: 'heirloom/a1', bytes: 2 * 1024 * 1024 }, user);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(state.inserted).toMatchObject({
      userId: 'u1',
      provider: 'cloudinary',
      publicId: 'heirloom/a1',
    });
    expect(usage.incrementUsage).toHaveBeenCalledWith(user, 'storage_mb', 2);
  });

  it('is idempotent for a replayed success callback and never double-bills', async () => {
    state.existing = { id: 'm1', bytes: 1024, altText: 'Pie' };

    await recordUpload({ url: URL_A, publicId: 'heirloom/a1', bytes: 5 * 1024 * 1024 }, user);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledOnce();
    expect(usage.incrementUsage).not.toHaveBeenCalled();
  });

  it('does not meter a pasted external URL, which costs us no storage', async () => {
    await recordUpload({ url: URL_A, bytes: 4 * 1024 * 1024 }, user);

    expect(state.inserted).toMatchObject({
      provider: 'external',
      publicId: null,
    });
    expect(usage.incrementUsage).not.toHaveBeenCalled();
  });

  it('rounds partial megabytes up so small uploads still count', async () => {
    await recordUpload({ url: URL_A, publicId: 'heirloom/a1', bytes: 1 }, user);
    expect(usage.incrementUsage).toHaveBeenCalledWith(user, 'storage_mb', 1);
  });

  it('no-ops without a database', async () => {
    state.configured = false;
    await expect(recordUpload({ url: URL_A }, user)).resolves.toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('updateAltText', () => {
  it("rejects an asset the caller doesn't own without leaking existence", async () => {
    // The ownership filter is part of the query, so a foreign row simply
    // doesn't come back.
    state.existing = undefined;
    await expect(updateAltText('m1', 'Pie', other)).rejects.toThrow('NOT_FOUND');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('clears the description when given undefined', async () => {
    state.existing = { id: 'm1', altText: 'Old' };
    await updateAltText('m1', undefined, user);
    expect(state.updated).toEqual({ altText: null });
  });
});

describe('deleteAsset', () => {
  it('destroys the remote asset, tombstones the row, and reclaims storage', async () => {
    state.existing = {
      id: 'm1',
      provider: 'cloudinary',
      publicId: 'heirloom/a1',
      bytes: 3 * 1024 * 1024,
    };

    await deleteAsset('m1', user);

    expect(state.destroyCalls).toEqual(['heirloom/a1']);
    expect(state.updated).toMatchObject({ deletedBy: 'u1' });
    expect(state.updated?.deletedAt).toBeInstanceOf(Date);
    expect(usage.decrementUsage).toHaveBeenCalledWith(user, 'storage_mb', 3);
  });

  it('still tombstones when the remote asset is already gone', async () => {
    state.existing = {
      id: 'm1',
      provider: 'cloudinary',
      publicId: 'heirloom/a1',
      bytes: 1024,
    };
    state.destroyResult = { result: 'not found' };

    await expect(deleteAsset('m1', user)).resolves.toBeUndefined();
    expect(state.updated).toMatchObject({ deletedBy: 'u1' });
  });

  it('leaves the row intact when the provider fails, so we never lose the record', async () => {
    state.existing = {
      id: 'm1',
      provider: 'cloudinary',
      publicId: 'heirloom/a1',
    };
    state.destroyResult = { result: 'error' };

    await expect(deleteAsset('m1', user)).rejects.toThrow('PROVIDER_ERROR');
    expect(db.update).not.toHaveBeenCalled();
    expect(usage.decrementUsage).not.toHaveBeenCalled();
  });

  it('rejects a foreign asset', async () => {
    state.existing = undefined;
    await expect(deleteAsset('m1', other)).rejects.toThrow('NOT_FOUND');
    expect(state.destroyCalls).toEqual([]);
  });

  it('tombstones an external asset without calling the provider', async () => {
    state.existing = { id: 'm1', provider: 'external', publicId: null };

    await deleteAsset('m1', user);

    expect(state.destroyCalls).toEqual([]);
    expect(usage.decrementUsage).not.toHaveBeenCalled();
    expect(state.updated).toMatchObject({ deletedBy: 'u1' });
  });
});
