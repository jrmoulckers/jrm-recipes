import { clearAppCaches } from './offline-storage';

export type AccountIdentity = string | null;

export type AccountBoundCleanupContext = {
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined;
};

export type AccountBoundCleanupHandler = {
  id: string;
  cleanup: (context: AccountBoundCleanupContext) => void | Promise<void>;
};

/**
 * The single registry for browser data that belongs to the active account.
 * Add future account-scoped stores (such as dietary-model IndexedDB data) here.
 */
export const ACCOUNT_BOUND_CLEANUP_HANDLERS: readonly AccountBoundCleanupHandler[] = Object.freeze([
  Object.freeze({
    id: 'recipe-runtime-caches',
    cleanup: async ({ cacheStorage }: AccountBoundCleanupContext) => {
      await clearAppCaches(cacheStorage);
    },
  }),
]);

function browserCleanupContext(): AccountBoundCleanupContext {
  return {
    cacheStorage: typeof window === 'undefined' ? undefined : window.caches,
  };
}

/**
 * Best-effort cleanup of every registered account-scoped client store.
 * Individual failures never prevent another handler from running.
 */
export async function cleanupAccountBoundClientData(
  context: AccountBoundCleanupContext = browserCleanupContext(),
  handlers: readonly AccountBoundCleanupHandler[] = ACCOUNT_BOUND_CLEANUP_HANDLERS,
): Promise<void> {
  await Promise.allSettled(
    handlers.map(({ cleanup }) => Promise.resolve().then(() => cleanup(context))),
  );
}

export type AccountBoundCleanupCoordinator = {
  observe: (identity: AccountIdentity) => Promise<void>;
};

/**
 * Track loaded account identities and serialize cleanup when a signed-in
 * account disappears or changes. The first observation only establishes the
 * baseline, so mounting or hydrating never clears a valid offline cache.
 */
export function createAccountBoundCleanupCoordinator(
  cleanup: () => void | Promise<void> = cleanupAccountBoundClientData,
): AccountBoundCleanupCoordinator {
  let hasObservedIdentity = false;
  let previousIdentity: AccountIdentity = null;
  let cleanupQueue = Promise.resolve();

  return {
    observe(identity) {
      if (!hasObservedIdentity) {
        hasObservedIdentity = true;
        previousIdentity = identity;
        return cleanupQueue;
      }

      const shouldCleanup = previousIdentity !== null && previousIdentity !== identity;
      previousIdentity = identity;

      if (shouldCleanup) {
        cleanupQueue = cleanupQueue.then(cleanup, cleanup).catch(() => undefined);
      }

      return cleanupQueue;
    },
  };
}
