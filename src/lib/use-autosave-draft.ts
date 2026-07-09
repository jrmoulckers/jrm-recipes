"use client";

import * as React from "react";

/**
 * Draft auto-save + recovery for the recipe editor (issue #421).
 *
 * Long-time cooks often type slowly; a locked phone or a stray "back" tap used
 * to wipe a half-entered recipe. This hook quietly mirrors the in-progress
 * editor value to `localStorage` (debounced) so nothing is lost, offers to
 * restore an unfinished draft on return, and warns before an unsaved exit.
 *
 * The hook is deliberately storage-shape agnostic: callers pass whatever
 * snapshot object represents their form and get the same object back on
 * restore. Drafts are namespaced per key ("new" vs. a recipe id) so a new
 * recipe never contaminates an edit-in-progress and vice-versa.
 */

const PREFIX = "heirloom:recipe-draft:";

export type AutosaveDraft<T> = {
  /** A previously-saved draft found on mount, or null once resolved/absent. */
  availableDraft: T | null;
  /** Acknowledge the offered draft was applied; resumes autosaving. */
  acceptDraft: () => void;
  /** Throw the offered draft away and resume autosaving a fresh one. */
  discardDraft: () => void;
  /** Remove any persisted draft (call after a successful save). */
  clear: () => void;
};

export function draftStorageKey(key: string): string {
  return `${PREFIX}${key}`;
}

function readDraft<T>(storageKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useAutosaveDraft<T>({
  key,
  snapshot,
  dirty,
  debounceMs = 800,
}: {
  /** Namespace for this draft, e.g. "new" or a recipe id. */
  key: string;
  /** The current serializable editor value. */
  snapshot: T;
  /** Whether the value differs from its initial state (only dirty saves). */
  dirty: boolean;
  debounceMs?: number;
}): AutosaveDraft<T> {
  const storageKey = draftStorageKey(key);

  // A draft found at mount time is offered to the user before we resume
  // writing, so an unresolved offer can't be clobbered by the first keystroke.
  const [availableDraft, setAvailableDraft] = React.useState<T | null>(() =>
    readDraft<T>(storageKey),
  );
  const offered = availableDraft !== null;

  const clear = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage may be full or blocked (private mode); nothing to recover.
    }
  }, [storageKey]);

  const acceptDraft = React.useCallback(() => setAvailableDraft(null), []);
  const discardDraft = React.useCallback(() => {
    clear();
    setAvailableDraft(null);
  }, [clear]);

  // Debounced persist: skip while an unresolved draft offer is on screen so we
  // never overwrite it before the user chooses restore vs. discard.
  React.useEffect(() => {
    if (offered || !dirty || typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch {
        // Best-effort only.
      }
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [offered, dirty, snapshot, storageKey, debounceMs]);

  // Warn before an unsaved exit (refresh, close, back to a non-SPA page).
  React.useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require a returnValue to trigger the native prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return { availableDraft, acceptDraft, discardDraft, clear };
}
