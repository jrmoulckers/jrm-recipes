import { describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_BOUND_CLEANUP_HANDLERS,
  ACCOUNT_BOUND_OWNER_MARKER_KEY,
  type AccountBoundCleanupResult,
  type AccountBoundOwnerMarkerStore,
  cleanupAccountBoundClientData,
  createAccountBoundCleanupCoordinator,
  DIETARY_ACCOUNT_BOUND_CACHE_NAMES,
  DIETARY_ACCOUNT_BOUND_INDEXED_DB_NAMES,
  registerDietaryRuntimeStopHandler,
} from './account-bound-cleanup';

function ownerMarkerStore(initial: string | null = null): AccountBoundOwnerMarkerStore {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_, next) => {
      value = next;
    }),
    removeItem: vi.fn(() => {
      value = null;
    }),
  };
}

const markerForIdentity = async (identity: string) => `marker:${identity}`;

describe('cleanupAccountBoundClientData', () => {
  it('registers recipe and dietary stores without including the app-shell precache', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const deleteIndexedDatabase = vi.fn().mockResolvedValue(undefined);

    const result = await cleanupAccountBoundClientData({
      cacheStorage: { delete: deleteCache },
      deleteIndexedDatabase,
    });

    expect(ACCOUNT_BOUND_CLEANUP_HANDLERS.map(({ id }) => id)).toEqual([
      'dietary-runtime',
      'recipe-runtime-caches',
      'dietary-analysis-storage',
    ]);
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual([
      'heirloom-recipes',
      'heirloom-recipe-images',
      ...DIETARY_ACCOUNT_BOUND_CACHE_NAMES,
    ]);
    expect(deleteIndexedDatabase.mock.calls.map(([name]) => name)).toEqual(
      DIETARY_ACCOUNT_BOUND_INDEXED_DB_NAMES,
    );
    expect(result.ok).toBe(true);
  });

  it('is safe when browser storage APIs are unavailable', async () => {
    await expect(cleanupAccountBoundClientData({ cacheStorage: undefined })).resolves.toMatchObject(
      { ok: true },
    );
  });

  it('runs every registered handler even when one fails', async () => {
    const secondCleanup = vi.fn();

    const result = await cleanupAccountBoundClientData({ cacheStorage: undefined }, [
      {
        id: 'failing-store',
        cleanup: () => {
          throw new Error('unavailable');
        },
      },
      { id: 'future-store', cleanup: secondCleanup },
    ]);

    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: false,
      outcomes: [
        { id: 'failing-store', status: 'failed' },
        { id: 'future-store', status: 'cleared' },
      ],
    });
  });

  it('reports a rejected cache deletion instead of treating it as cleared', async () => {
    const deleteCache = vi
      .fn<(name: string) => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(true);

    const result = await cleanupAccountBoundClientData({
      cacheStorage: { delete: deleteCache },
      deleteIndexedDatabase: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.outcomes).toContainEqual({
      id: 'recipe-runtime-caches',
      status: 'failed',
    });
    expect(result.outcomes).toContainEqual({
      id: 'dietary-analysis-storage',
      status: 'cleared',
    });
  });

  it('stops dietary runtime work before purging its account-bound storage', async () => {
    const calls: string[] = [];
    const unregister = registerDietaryRuntimeStopHandler(() => {
      calls.push('stop');
    });

    try {
      const result = await cleanupAccountBoundClientData({
        cacheStorage: {
          delete: async (name) => {
            calls.push(`cache:${name}`);
            return true;
          },
        },
        deleteIndexedDatabase: async (name) => {
          calls.push(`indexed-db:${name}`);
        },
      });

      expect(result.ok).toBe(true);
      expect(calls.indexOf('stop')).toBeLessThan(
        calls.indexOf(`cache:${DIETARY_ACCOUNT_BOUND_CACHE_NAMES[0]}`),
      );
    } finally {
      unregister();
    }
  });

  it('bounds an unresponsive runtime stop and continues storage cleanup', async () => {
    vi.useFakeTimers();
    const unregister = registerDietaryRuntimeStopHandler(
      () =>
        new Promise<void>(() => {
          // Deliberately never acknowledges cancellation.
        }),
    );
    const deleteCache = vi.fn().mockResolvedValue(true);

    try {
      const cleanup = cleanupAccountBoundClientData({
        cacheStorage: { delete: deleteCache },
      });
      await vi.advanceTimersByTimeAsync(2_000);

      await expect(cleanup).resolves.toMatchObject({
        ok: false,
        outcomes: expect.arrayContaining([{ id: 'dietary-runtime', status: 'failed' }]),
      });
      expect(deleteCache).toHaveBeenCalled();
    } finally {
      unregister();
      vi.useRealTimers();
    }
  });
});

describe('createAccountBoundCleanupCoordinator', () => {
  it('trusts only a matching persisted owner on the initial identity', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore('marker:account-a'),
      markerForIdentity,
    );

    await coordinator.observe('account-a');
    await coordinator.observe('account-a');

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('purges an unknown persisted owner before trusting the first identity', async () => {
    const cleanup = vi.fn();
    const store = ownerMarkerStore();
    const coordinator = createAccountBoundCleanupCoordinator(cleanup, store, markerForIdentity);

    await expect(coordinator.observe('account-a')).resolves.toBe(true);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(store.setItem).toHaveBeenCalledWith(ACCOUNT_BOUND_OWNER_MARKER_KEY, 'marker:account-a');
  });

  it('purges unknown storage before trusting an initial signed-out state', async () => {
    const cleanup = vi.fn();
    const store = ownerMarkerStore();
    const coordinator = createAccountBoundCleanupCoordinator(cleanup, store, markerForIdentity);

    await expect(coordinator.observe(null)).resolves.toBe(true);
    await coordinator.observe(null);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(store.setItem).toHaveBeenCalledWith(ACCOUNT_BOUND_OWNER_MARKER_KEY, 'signed-out:clean');
  });

  it('cleans up when a signed-in account signs out', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore('marker:account-a'),
      markerForIdentity,
    );

    await coordinator.observe('account-a');
    await coordinator.observe(null);

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans up when one signed-in account replaces another', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore('marker:account-a'),
      markerForIdentity,
    );

    await coordinator.observe('account-a');
    await coordinator.observe('account-b');

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('purges between an initially unknown signed-out state and a signed-in account', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore(),
      markerForIdentity,
    );

    await coordinator.observe(null);
    await coordinator.observe('account-a');

    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('keeps later transitions usable when cleanup rejects', async () => {
    const cleanup = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValue(undefined);
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore('marker:account-a'),
      markerForIdentity,
    );

    await coordinator.observe('account-a');
    await expect(coordinator.observe('account-b')).resolves.toBe(false);
    await expect(coordinator.observe('account-b')).resolves.toBe(true);

    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('retries a cleanup result that reports a failed handler', async () => {
    const cleanup = vi
      .fn<() => Promise<AccountBoundCleanupResult>>()
      .mockResolvedValueOnce({
        ok: false,
        outcomes: [{ id: 'dietary-analysis-storage', status: 'failed' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        outcomes: [{ id: 'dietary-analysis-storage', status: 'cleared' }],
      });
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore('marker:account-a'),
      markerForIdentity,
    );

    await coordinator.observe('account-a');
    await expect(coordinator.observe('account-b')).resolves.toBe(false);
    await expect(coordinator.observe('account-b')).resolves.toBe(true);

    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('does not commit a stale identity from an in-flight cleanup', async () => {
    let finishFirstCleanup: (() => void) | undefined;
    let markCleanupStarted: (() => void) | undefined;
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });
    const cleanup = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirstCleanup = resolve;
            markCleanupStarted?.();
          }),
      )
      .mockResolvedValue(undefined);
    const coordinator = createAccountBoundCleanupCoordinator(
      cleanup,
      ownerMarkerStore('marker:account-a'),
      markerForIdentity,
    );

    await coordinator.observe('account-a');
    const toB = coordinator.observe('account-b');
    await cleanupStarted;
    const backToA = coordinator.observe('account-a');
    finishFirstCleanup?.();
    await Promise.all([toB, backToA]);
    await coordinator.observe('account-b');

    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
