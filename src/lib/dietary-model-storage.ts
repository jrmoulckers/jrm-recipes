'use client';

import {
  DIETARY_MODEL,
  DIETARY_MODEL_CACHE_PREFIX,
  DIETARY_MODEL_LOCAL_PREFIX,
  type DietaryRuntimeKind,
} from '~/config/on-device-dietary';

const DB_NAME = 'heirloom-dietary-analysis';
const DB_VERSION = 2;
const STORE_NAME = 'installations';
const ANALYSIS_STORE_NAME = 'analyses';
const APPROVED_MODEL_ORIGINS = new Set([
  'https://huggingface.co',
  'https://cdn-lfs.hf.co',
  'https://cas-bridge.xethub.hf.co',
]);

export type DietaryModelInstallation = {
  accountId: string;
  enabled: boolean;
  revision: string;
  installedAt: string;
};

export type DietaryDeviceCapability = {
  supported: boolean;
  runtime: DietaryRuntimeKind;
  reason?: 'insecure_context' | 'missing_platform_api' | 'insufficient_storage';
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'accountId' });
      }
      if (!request.result.objectStoreNames.contains(ANALYSIS_STORE_NAME)) {
        request.result.createObjectStore(ANALYSIS_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open analysis storage.'));
  });
}

async function putInstallation(installation: DietaryModelInstallation): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(installation);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Unable to save analysis setup.'));
    });
  } finally {
    database.close();
  }
}

export async function getDietaryModelInstallation(
  accountId: string,
): Promise<DietaryModelInstallation | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(accountId);
      request.onsuccess = () =>
        resolve((request.result as DietaryModelInstallation | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read analysis setup.'));
    });
  } finally {
    database.close();
  }
}

function analysisId(accountId: string, recipeId: string): string {
  return `${accountId}:${recipeId}`;
}

export async function hasCurrentDietaryAnalysis(
  accountId: string,
  recipeId: string,
  ingredientFingerprint: string,
): Promise<boolean> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(ANALYSIS_STORE_NAME)
        .objectStore(ANALYSIS_STORE_NAME)
        .get(analysisId(accountId, recipeId));
      request.onsuccess = () => {
        const result = request.result as
          { ingredientFingerprint: string; analyzerVersion: string } | undefined;
        resolve(
          result?.ingredientFingerprint === ingredientFingerprint &&
            result.analyzerVersion === DIETARY_MODEL.analyzerVersion,
        );
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Unable to read the local analysis cache.'));
    });
  } finally {
    database.close();
  }
}

export async function markDietaryAnalysisCurrent(
  accountId: string,
  recipeId: string,
  ingredientFingerprint: string,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ANALYSIS_STORE_NAME, 'readwrite');
      transaction.objectStore(ANALYSIS_STORE_NAME).put({
        id: analysisId(accountId, recipeId),
        accountId,
        recipeId,
        ingredientFingerprint,
        analyzerVersion: DIETARY_MODEL.analyzerVersion,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Unable to update the local analysis cache.'));
    });
  } finally {
    database.close();
  }
}

export async function detectDietaryDeviceCapability(): Promise<DietaryDeviceCapability> {
  if (!window.isSecureContext) {
    return { supported: false, runtime: 'deterministic_only', reason: 'insecure_context' };
  }
  if (
    typeof Worker === 'undefined' ||
    typeof WebAssembly === 'undefined' ||
    typeof caches === 'undefined' ||
    typeof indexedDB === 'undefined' ||
    !navigator.storage?.estimate
  ) {
    return { supported: false, runtime: 'deterministic_only', reason: 'missing_platform_api' };
  }
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  if (quota - usage < DIETARY_MODEL.requiredFreeBytes) {
    return { supported: false, runtime: 'deterministic_only', reason: 'insufficient_storage' };
  }
  return {
    supported: true,
    runtime: 'gpu' in navigator ? 'webgpu' : 'wasm',
  };
}

function localAssetUrl(path: string): string {
  return new URL(`${DIETARY_MODEL_LOCAL_PREFIX}${DIETARY_MODEL.id}/${path}`, window.location.origin)
    .href;
}

export function dietaryModelAssetUrl(path: string): string {
  const encodedPath = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://huggingface.co/${DIETARY_MODEL.id}/resolve/${DIETARY_MODEL.revision}/${encodedPath}`;
}

export function isApprovedDietaryModelResponseUrl(url: string): boolean {
  try {
    return APPROVED_MODEL_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function downloadVerifiedAsset(path: string, sha256: string): Promise<Response> {
  const response = await fetch(dietaryModelAssetUrl(path), {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok || !isApprovedDietaryModelResponseUrl(response.url)) {
    throw new Error('MODEL_DOWNLOAD_REJECTED');
  }
  const body = await response.arrayBuffer();
  if ((await sha256Hex(body)) !== sha256) {
    throw new Error('MODEL_INTEGRITY_CHECK_FAILED');
  }
  return new Response(body, {
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function installDietaryModel(
  accountId: string,
  onProgress?: (downloadedBytes: number) => void,
): Promise<void> {
  const capability = await detectDietaryDeviceCapability();
  if (!capability.supported) throw new Error(capability.reason);

  await navigator.storage.persist?.();
  const stagingName = `${DIETARY_MODEL.cacheName}-staging-${accountId}`;
  await caches.delete(stagingName);
  const staging = await caches.open(stagingName);
  let downloadedBytes = 0;

  try {
    for (const asset of DIETARY_MODEL.assets) {
      const response = await downloadVerifiedAsset(asset.path, asset.sha256);
      await staging.put(localAssetUrl(asset.path), response);
      downloadedBytes += asset.bytes;
      onProgress?.(downloadedBytes);
    }

    const active = await caches.open(DIETARY_MODEL.cacheName);
    for (const asset of DIETARY_MODEL.assets) {
      const url = localAssetUrl(asset.path);
      const response = await staging.match(url);
      if (!response) throw new Error('MODEL_INSTALL_INTERRUPTED');
      await active.put(url, response);
    }
    await putInstallation({
      accountId,
      enabled: true,
      revision: DIETARY_MODEL.revision,
      installedAt: new Date().toISOString(),
    });
  } finally {
    await caches.delete(stagingName);
  }
}

export async function clearDietaryModelData(accountId?: string): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(DIETARY_MODEL_CACHE_PREFIX))
      .map((name) => caches.delete(name)),
  );

  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, ANALYSIS_STORE_NAME], 'readwrite');
      const installations = transaction.objectStore(STORE_NAME);
      const analyses = transaction.objectStore(ANALYSIS_STORE_NAME);
      if (accountId) {
        installations.delete(accountId);
        const request = analyses.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value = cursor.value as { accountId?: string };
          if (value.accountId === accountId) cursor.delete();
          cursor.continue();
        };
      } else {
        installations.clear();
        analyses.clear();
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Unable to clear analysis setup.'));
    });
  } finally {
    database.close();
  }
}
