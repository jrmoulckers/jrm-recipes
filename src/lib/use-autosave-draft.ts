'use client';

import * as React from 'react';

const PREFIX = 'heirloom:recipe-draft';

export const DRAFT_SCHEMA_VERSION = 1;

export type DraftContext =
  { userId: string; mode: 'create' } | { userId: string; mode: 'edit'; recipeId: string };

export type DraftIssue =
  'expired' | 'incompatible' | 'malformed' | 'storage-unavailable' | 'cross-tab-conflict';

export type AutosaveDraft<T> = {
  availableDraft: T | null;
  acceptDraft: () => void;
  discardDraft: () => void;
  clear: () => void;
  allowNavigation: () => void;
};

export function draftStorageKey(context: DraftContext): string {
  const user = encodeURIComponent(context.userId);
  const target =
    context.mode === 'edit' ? `edit:${encodeURIComponent(context.recipeId)}` : 'create:new';
  return `${PREFIX}:v${DRAFT_SCHEMA_VERSION}:${user}:${target}`;
}

export function useAutosaveDraft<T>({
  context,
  snapshot,
  dirty,
  onIssue,
  debounceMs = 800,
  now = Date.now,
}: {
  context: DraftContext | null;
  snapshot: T;
  dirty: boolean;
  onIssue?: (issue: DraftIssue) => void;
  debounceMs?: number;
  now?: () => number;
}): AutosaveDraft<T> {
  const storageKey = context ? draftStorageKey(context) : null;
  const [availableDraft, setAvailableDraft] = React.useState<T | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);
  const navigationAllowedRef = React.useRef(false);
  const persistenceSuspendedRef = React.useRef(false);
  const reportedIssuesRef = React.useRef<Set<DraftIssue>>(new Set());
  const dirtyRef = React.useRef(dirty);
  const snapshotRef = React.useRef(snapshot);
  const onIssueRef = React.useRef(onIssue);
  const nowRef = React.useRef(now);

  dirtyRef.current = dirty;
  snapshotRef.current = snapshot;
  onIssueRef.current = onIssue;
  nowRef.current = now;

  const report = React.useCallback((issue: DraftIssue) => {
    if (reportedIssuesRef.current.has(issue)) return;
    reportedIssuesRef.current.add(issue);
    onIssueRef.current?.(issue);
  }, []);

  const getStorage = React.useCallback((): Storage | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      report('storage-unavailable');
      return null;
    }
  }, [report]);

  const removeStoredDraft = React.useCallback(() => {
    if (storageKey === null) return;
    const storage = getStorage();
    if (storage === null) return;
    try {
      storage.removeItem(storageKey);
    } catch {
      report('storage-unavailable');
    }
  }, [getStorage, report, storageKey]);

  React.useEffect(() => {
    let active = true;
    setAvailableDraft(null);
    setHydrated(false);
    navigationAllowedRef.current = false;
    persistenceSuspendedRef.current = false;
    reportedIssuesRef.current.clear();

    if (storageKey === null) {
      setHydrated(true);
      return;
    }

    void import('./draft-storage').then(
      ({ readDraft }) => {
        if (!active) return;
        const storage = getStorage();
        if (storage === null) {
          setHydrated(true);
          return;
        }

        let raw: string | null;
        try {
          raw = storage.getItem(storageKey);
        } catch {
          report('storage-unavailable');
          setHydrated(true);
          return;
        }

        const result = readDraft(raw, snapshotRef.current, nowRef.current(), DRAFT_SCHEMA_VERSION);
        if (result.status === 'valid') {
          setAvailableDraft(result.data);
        } else if (result.status === 'invalid') {
          report(result.issue);
          try {
            storage.removeItem(storageKey);
          } catch {
            report('storage-unavailable');
          }
        }
        setHydrated(true);
      },
      () => {
        if (!active) return;
        report('storage-unavailable');
        setHydrated(true);
      },
    );

    return () => {
      active = false;
    };
  }, [getStorage, report, storageKey]);

  const clearPendingWrite = React.useCallback(() => {
    if (timeoutRef.current === null || typeof window === 'undefined') return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clear = React.useCallback(() => {
    persistenceSuspendedRef.current = true;
    clearPendingWrite();
    removeStoredDraft();
    setAvailableDraft(null);
  }, [clearPendingWrite, removeStoredDraft]);

  const discardDraft = React.useCallback(() => {
    persistenceSuspendedRef.current = false;
    clearPendingWrite();
    removeStoredDraft();
    setAvailableDraft(null);
  }, [clearPendingWrite, removeStoredDraft]);

  React.useEffect(() => {
    if (
      !hydrated ||
      availableDraft !== null ||
      !dirty ||
      storageKey === null ||
      persistenceSuspendedRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      void import('./draft-storage').then(
        ({ serializeDraft }) => {
          if (persistenceSuspendedRef.current) return;
          const storage = getStorage();
          if (storage === null) return;
          try {
            storage.setItem(
              storageKey,
              serializeDraft(snapshot, nowRef.current(), DRAFT_SCHEMA_VERSION),
            );
          } catch {
            report('storage-unavailable');
          }
        },
        () => report('storage-unavailable'),
      );
    }, debounceMs);

    return clearPendingWrite;
  }, [
    availableDraft,
    clearPendingWrite,
    debounceMs,
    dirty,
    getStorage,
    hydrated,
    report,
    snapshot,
    storageKey,
  ]);

  React.useEffect(() => {
    if (storageKey === null || typeof window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      if (event.newValue === null) {
        if (!dirtyRef.current) setAvailableDraft(null);
        return;
      }

      void import('./draft-storage').then(
        ({ readDraft }) => {
          const result = readDraft(
            event.newValue,
            snapshotRef.current,
            nowRef.current(),
            DRAFT_SCHEMA_VERSION,
          );
          if (result.status === 'invalid') {
            report(result.issue);
          } else if (result.status === 'valid' && dirtyRef.current) {
            report('cross-tab-conflict');
          } else if (result.status === 'valid') {
            setAvailableDraft(result.data);
          }
        },
        () => report('storage-unavailable'),
      );
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [report, storageKey]);

  React.useEffect(() => {
    if (!dirty || typeof window === 'undefined') return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationAllowedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return {
    availableDraft,
    acceptDraft: () => setAvailableDraft(null),
    discardDraft,
    clear,
    allowNavigation: () => {
      navigationAllowedRef.current = true;
    },
  };
}
