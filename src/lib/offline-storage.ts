/**
 * Pure helpers for the "Offline storage" control (#172): estimating cache usage,
 * clearing the app's runtime caches, and requesting durable storage. Kept free
 * of React and injected with the relevant browser APIs so the logic is
 * unit-testable without a DOM. The UI lives in
 * `src/components/pwa/offline-storage-menu.tsx`.
 */

import { RECIPE_IMAGE_CACHE_NAME } from "./recipe-image-cache";
import { RECIPE_PAGE_CACHE_NAME } from "./recipe-page-cache";

/**
 * Runtime caches this app fills that a user can safely clear to reclaim space.
 * The precached app shell is deliberately excluded so the app still loads
 * offline after a clear — these just rebuild as the user browses again.
 */
export const APP_RUNTIME_CACHE_NAMES: readonly string[] = [
  RECIPE_PAGE_CACHE_NAME,
  RECIPE_IMAGE_CACHE_NAME,
];

export type StorageEstimateResult = {
  /** Whether the platform exposed a usable `navigator.storage.estimate()`. */
  supported: boolean;
  usage: number;
  quota: number;
  /** Fraction 0..1 of quota used, or 0 when unknown. */
  ratio: number;
};

/**
 * Read estimated offline storage usage. Returns an `unsupported` result (rather
 * than throwing) when the Storage API is missing or the call fails, so callers
 * can render a graceful fallback.
 */
export async function estimateOfflineStorage(
  manager: Pick<StorageManager, "estimate"> | undefined,
): Promise<StorageEstimateResult> {
  if (!manager?.estimate) {
    return { supported: false, usage: 0, quota: 0, ratio: 0 };
  }
  try {
    const estimate = await manager.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const ratio = quota > 0 ? Math.min(1, Math.max(0, usage / quota)) : 0;
    return { supported: true, usage, quota, ratio };
  } catch {
    return { supported: false, usage: 0, quota: 0, ratio: 0 };
  }
}

/**
 * Delete the app's runtime caches (recipe pages + images). Returns how many of
 * the named caches were actually present and removed. Safe when the Cache
 * Storage API is unavailable (returns 0) and when a cache doesn't exist.
 */
export async function clearAppCaches(
  cacheStorage: Pick<CacheStorage, "delete"> | undefined,
  names: readonly string[] = APP_RUNTIME_CACHE_NAMES,
): Promise<number> {
  if (!cacheStorage?.delete) return 0;
  const results = await Promise.all(
    names.map((name) => cacheStorage.delete(name).catch(() => false)),
  );
  return results.filter(Boolean).length;
}

/**
 * Best-effort request for durable (persistent) storage so the browser is less
 * likely to evict our caches under pressure. Resolves to the resulting
 * persisted state and never throws.
 */
export async function requestPersistentStorage(
  manager: Pick<StorageManager, "persist" | "persisted"> | undefined,
): Promise<boolean> {
  if (!manager) return false;
  try {
    if (manager.persisted && (await manager.persisted())) return true;
    if (manager.persist) return await manager.persist();
    return false;
  } catch {
    return false;
  }
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Format a byte count as a compact, human-friendly string (e.g. "12.3 MB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[unit] ?? "B"}`;
}
