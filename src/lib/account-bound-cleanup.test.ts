import { describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_BOUND_CLEANUP_HANDLERS,
  cleanupAccountBoundClientData,
  createAccountBoundCleanupCoordinator,
  DIETARY_ACCOUNT_BOUND_CACHE_NAMES,
  DIETARY_ACCOUNT_BOUND_INDEXED_DB_NAMES,
} from './account-bound-cleanup';

describe('cleanupAccountBoundClientData', () => {
  it('registers recipe and dietary stores without including the app-shell precache', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const deleteIndexedDatabase = vi.fn().mockResolvedValue(undefined);

    await cleanupAccountBoundClientData({
      cacheStorage: { delete: deleteCache },
      deleteIndexedDatabase,
    });

    expect(ACCOUNT_BOUND_CLEANUP_HANDLERS.map(({ id }) => id)).toEqual([
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
  });

  it('is safe when browser storage APIs are unavailable', async () => {
    await expect(
      cleanupAccountBoundClientData({ cacheStorage: undefined }),
    ).resolves.toBeUndefined();
  });

  it('runs every registered handler even when one fails', async () => {
    const secondCleanup = vi.fn();

    await cleanupAccountBoundClientData({ cacheStorage: undefined }, [
      {
        id: 'failing-store',
        cleanup: () => {
          throw new Error('unavailable');
        },
      },
      { id: 'future-store', cleanup: secondCleanup },
    ]);

    expect(secondCleanup).toHaveBeenCalledOnce();
  });
});

describe('createAccountBoundCleanupCoordinator', () => {
  it('does not clean up on the initial or unchanged identity', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(cleanup);

    await coordinator.observe('account-a');
    await coordinator.observe('account-a');

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans up when a signed-in account signs out', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(cleanup);

    await coordinator.observe('account-a');
    await coordinator.observe(null);

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans up when one signed-in account replaces another', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(cleanup);

    await coordinator.observe('account-a');
    await coordinator.observe('account-b');

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('does not clean up when the first signed-in account follows signed-out state', async () => {
    const cleanup = vi.fn();
    const coordinator = createAccountBoundCleanupCoordinator(cleanup);

    await coordinator.observe(null);
    await coordinator.observe('account-a');

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('keeps later transitions usable when cleanup rejects', async () => {
    const cleanup = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValue(undefined);
    const coordinator = createAccountBoundCleanupCoordinator(cleanup);

    await coordinator.observe('account-a');
    await coordinator.observe('account-b');
    await coordinator.observe(null);

    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
