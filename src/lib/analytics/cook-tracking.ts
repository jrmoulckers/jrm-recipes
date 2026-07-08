/**
 * Cook-session tracking dedupe (issue #313).
 *
 * Cook Mode state is mirrored to localStorage keyed by recipe id and survives
 * reloads, so a naive `cook_started` on mount would double-count every refresh.
 * These helpers persist a tiny marker (the session start time) keyed by recipe
 * id so `cook_started` fires once per real session and `cook_completed` can
 * report an accurate elapsed duration even across a reload. They're pure over an
 * injectable Storage-like object, so they're trivially unit-testable and never
 * throw on private-mode/quota failures.
 */

export const COOK_TRACK_PREFIX = "heirloom.cook.track.";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function cookTrackKey(recipeId: string): string {
  return `${COOK_TRACK_PREFIX}${recipeId}`;
}

/**
 * Begin (or resume) a cook tracking session. Returns `isNew: true` only the
 * first time for a given recipe — subsequent calls (a reload rehydrating the
 * same session) return the original `startedAt` and `isNew: false`, so callers
 * emit `cook_started` exactly once.
 */
export function beginCookSession(
  storage: WritableStorage | null | undefined,
  recipeId: string,
  now: number = Date.now(),
): { isNew: boolean; startedAt: number } {
  if (!storage) return { isNew: true, startedAt: now };
  const key = cookTrackKey(recipeId);
  const existing = storage.getItem(key);
  if (existing != null) {
    const startedAt = Number(existing);
    if (Number.isFinite(startedAt)) return { isNew: false, startedAt };
  }
  try {
    storage.setItem(key, String(now));
  } catch {
    // Ignore private-mode / quota write failures — still a new session.
  }
  return { isNew: true, startedAt: now };
}

/**
 * End the cook tracking session and return its elapsed duration. Clears the
 * marker so a fresh cook of the same recipe starts a new session.
 */
export function endCookSession(
  storage: WritableStorage | null | undefined,
  recipeId: string,
  now: number = Date.now(),
): { durationMs: number } {
  const key = cookTrackKey(recipeId);
  let startedAt = now;
  if (storage) {
    const existing = storage.getItem(key);
    const parsed = existing != null ? Number(existing) : Number.NaN;
    if (Number.isFinite(parsed)) startedAt = parsed;
    try {
      storage.removeItem(key);
    } catch {
      // Ignore removal failures.
    }
  }
  return { durationMs: Math.max(0, now - startedAt) };
}

export type { ReadableStorage, WritableStorage };
