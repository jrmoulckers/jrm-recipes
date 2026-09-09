import { APP_RUNTIME_CACHE_NAMES } from './offline-storage';

export type AccountIdentity = string | null;

export type AccountBoundOwnerMarkerStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type AccountBoundCleanupContext = {
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined;
  deleteIndexedDatabase?: (name: string) => void | Promise<void>;
};

export type AccountBoundCleanupHandler = {
  id: string;
  cleanup: (context: AccountBoundCleanupContext) => void | Promise<void>;
};

export type AccountBoundCleanupResult = {
  ok: boolean;
  outcomes: Array<{ id: string; status: 'cleared' | 'failed' }>;
};

export type DietaryRuntimeStopHandler = () => void | Promise<void>;

export const DIETARY_ACCOUNT_BOUND_CACHE_NAMES: readonly string[] = Object.freeze([
  'heirloom-dietary-model-assets',
]);

export const DIETARY_ACCOUNT_BOUND_INDEXED_DB_NAMES: readonly string[] = Object.freeze([
  'heirloom-dietary-analysis',
]);

const DIETARY_RUNTIME_STOP_TIMEOUT_MS = 2_000;
const dietaryRuntimeStopHandlers = new Set<DietaryRuntimeStopHandler>();

export function registerDietaryRuntimeStopHandler(handler: DietaryRuntimeStopHandler): () => void {
  dietaryRuntimeStopHandlers.add(handler);
  return () => dietaryRuntimeStopHandlers.delete(handler);
}

async function deleteCaches(
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined,
  names: readonly string[],
): Promise<void> {
  if (!cacheStorage?.delete) return;
  await Promise.all(names.map((name) => cacheStorage.delete(name)));
}

async function withTimeout(task: Promise<void>, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('ACCOUNT_BOUND_CLEANUP_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function stopDietaryRuntime(): Promise<boolean> {
  const outcomes = await Promise.allSettled(
    [...dietaryRuntimeStopHandlers].map((stop) =>
      withTimeout(Promise.resolve().then(stop), DIETARY_RUNTIME_STOP_TIMEOUT_MS),
    ),
  );
  return outcomes.every(({ status }) => status === 'fulfilled');
}

async function deleteIndexedDatabase(factory: IDBFactory, name: string): Promise<void> {
  const request = factory.deleteDatabase(name);

  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error(`Could not delete IndexedDB database "${name}".`));
    request.onblocked = () =>
      reject(new Error(`Deletion of IndexedDB database "${name}" was blocked.`));
  });
}

/**
 * The single registry for browser data that belongs to the active account.
 * Add future account-scoped stores (such as dietary-model IndexedDB data) here.
 */
export const ACCOUNT_BOUND_CLEANUP_HANDLERS: readonly AccountBoundCleanupHandler[] = Object.freeze([
  Object.freeze({
    id: 'dietary-runtime',
    cleanup: async () => {
      const stopped = await stopDietaryRuntime();
      if (!stopped) throw new Error('DIETARY_RUNTIME_STOP_FAILED');
    },
  }),
  Object.freeze({
    id: 'recipe-runtime-caches',
    cleanup: async ({ cacheStorage }: AccountBoundCleanupContext) => {
      await deleteCaches(cacheStorage, APP_RUNTIME_CACHE_NAMES);
    },
  }),
  Object.freeze({
    id: 'dietary-analysis-storage',
    cleanup: async ({ cacheStorage, deleteIndexedDatabase }: AccountBoundCleanupContext) => {
      await Promise.all([
        deleteCaches(cacheStorage, DIETARY_ACCOUNT_BOUND_CACHE_NAMES),
        ...(deleteIndexedDatabase
          ? DIETARY_ACCOUNT_BOUND_INDEXED_DB_NAMES.map((name) => deleteIndexedDatabase(name))
          : []),
      ]);
    },
  }),
]);

function browserCleanupContext(): AccountBoundCleanupContext {
  return {
    cacheStorage: typeof window === 'undefined' ? undefined : window.caches,
    deleteIndexedDatabase:
      typeof window === 'undefined' || !window.indexedDB
        ? undefined
        : (name) => deleteIndexedDatabase(window.indexedDB, name),
  };
}

/**
 * Cleanup every registered account-scoped client store. Individual failures
 * never prevent another handler from running, and callers receive only fixed
 * handler ids and bounded outcomes rather than raw storage exceptions.
 */
export async function cleanupAccountBoundClientData(
  context: AccountBoundCleanupContext = browserCleanupContext(),
  handlers: readonly AccountBoundCleanupHandler[] = ACCOUNT_BOUND_CLEANUP_HANDLERS,
): Promise<AccountBoundCleanupResult> {
  const outcomes: AccountBoundCleanupResult['outcomes'] = [];
  for (const { id, cleanup } of handlers) {
    try {
      await cleanup(context);
      outcomes.push({ id, status: 'cleared' });
    } catch {
      outcomes.push({ id, status: 'failed' });
    }
  }
  return {
    ok: outcomes.every(({ status }) => status === 'cleared'),
    outcomes,
  };
}

export type AccountBoundCleanupCoordinator = {
  observe: (identity: AccountIdentity) => Promise<boolean>;
};

export const ACCOUNT_BOUND_OWNER_MARKER_KEY = 'heirloom-account-bound-owner';
const SIGNED_OUT_OWNER_MARKER = 'signed-out:clean';

export type AccountIdentityMarker = (identity: string) => Promise<string | null>;

function cleanupSucceeded(result: unknown): boolean {
  return result == null || typeof result !== 'object' || !('ok' in result) || result.ok !== false;
}

async function hashAccountIdentity(identity: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

function browserOwnerMarkerStore(): AccountBoundOwnerMarkerStore | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readOwnerMarker(store: AccountBoundOwnerMarkerStore | undefined): string | null {
  if (!store) return null;
  try {
    return store.getItem(ACCOUNT_BOUND_OWNER_MARKER_KEY);
  } catch {
    return null;
  }
}

function writeOwnerMarker(
  store: AccountBoundOwnerMarkerStore | undefined,
  marker: string | null,
): void {
  if (!store) return;
  try {
    if (marker == null) {
      store.removeItem(ACCOUNT_BOUND_OWNER_MARKER_KEY);
    } else {
      store.setItem(ACCOUNT_BOUND_OWNER_MARKER_KEY, marker);
    }
  } catch {
    // An unavailable marker makes the next mount purge again rather than trust unknown ownership.
  }
}

/**
 * Track loaded account identities and serialize cleanup when a signed-in
 * account disappears or changes. Persistent ownership must be verified before
 * account-bound storage is trusted, including on the first observation.
 */
export function createAccountBoundCleanupCoordinator(
  cleanup: () => unknown | Promise<unknown> = cleanupAccountBoundClientData,
  ownerMarkerStore: AccountBoundOwnerMarkerStore | undefined = browserOwnerMarkerStore(),
  markerForIdentity: AccountIdentityMarker = hashAccountIdentity,
): AccountBoundCleanupCoordinator {
  let committedIdentity: AccountIdentity | undefined;
  let latestGeneration = 0;
  let cleanupQueue = Promise.resolve(true);

  async function reconcile(identity: AccountIdentity, generation: number): Promise<boolean> {
    const desiredMarker =
      identity == null ? SIGNED_OUT_OWNER_MARKER : await markerForIdentity(identity);
    const storedMarker = readOwnerMarker(ownerMarkerStore);
    const knownSameIdentity = committedIdentity !== undefined && committedIdentity === identity;
    const persistentOwnerMatches = desiredMarker != null && storedMarker === desiredMarker;
    const mustCleanup = !knownSameIdentity && !persistentOwnerMatches;

    let succeeded = true;
    try {
      if (mustCleanup) succeeded = cleanupSucceeded(await cleanup());
    } catch {
      succeeded = false;
    }

    if (!succeeded || generation !== latestGeneration) return succeeded;
    committedIdentity = identity;
    writeOwnerMarker(ownerMarkerStore, desiredMarker);
    return true;
  }

  return {
    observe(identity) {
      const generation = ++latestGeneration;
      cleanupQueue = cleanupQueue.then(() => reconcile(identity, generation));
      return cleanupQueue;
    },
  };
}
