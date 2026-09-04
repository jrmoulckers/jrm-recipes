import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DRAFT_SCHEMA_VERSION,
  draftStorageKey,
  useAutosaveDraft,
  type DraftContext,
} from './use-autosave-draft';
import { DRAFT_TTL_MS, serializeDraft } from './draft-storage';

type Draft = { title: string };

const CREATE_CONTEXT = { userId: 'user-a', mode: 'create' } satisfies DraftContext;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderDraft({
  context = CREATE_CONTEXT,
  snapshot = { title: '' },
  dirty = false,
  onIssue,
}: {
  context?: DraftContext | null;
  snapshot?: Draft;
  dirty?: boolean;
  onIssue?: (issue: string) => void;
} = {}) {
  return renderHook(
    (props) =>
      useAutosaveDraft<Draft>({
        ...props,
        debounceMs: 500,
      }),
    { initialProps: { context, snapshot, dirty, onIssue } },
  );
}

async function flushDraftModule() {
  await act(async () => {
    await import('./draft-storage');
  });
}

describe('useAutosaveDraft (#115)', () => {
  it('isolates drafts by schema, user, create/edit context, and recipe', () => {
    const createA = draftStorageKey(CREATE_CONTEXT);
    const createB = draftStorageKey({ userId: 'user-b', mode: 'create' });
    const guidedA = draftStorageKey({ userId: 'user-a', mode: 'guided-create' });
    const editA1 = draftStorageKey({ userId: 'user-a', mode: 'edit', recipeId: 'recipe-1' });
    const editA2 = draftStorageKey({ userId: 'user-a', mode: 'edit', recipeId: 'recipe-2' });

    expect(createA).toContain(`:v${DRAFT_SCHEMA_VERSION}:`);
    expect(createA).toContain(':create:new');
    expect(guidedA).toContain(':guided-create:new');
    expect(new Set([createA, createB, guidedA, editA1, editA2]).size).toBe(5);
  });

  it('offers a valid saved draft after client hydration', async () => {
    window.localStorage.setItem(
      draftStorageKey(CREATE_CONTEXT),
      serializeDraft({ title: "Grandma's stew" }),
    );

    const { result } = renderDraft();
    await flushDraftModule();

    expect(result.current.availableDraft).toEqual({ title: "Grandma's stew" });
  });

  it('debounce-saves the latest dirty snapshot', async () => {
    const { rerender } = renderDraft({ snapshot: { title: 'Pi' }, dirty: true });
    await flushDraftModule();

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(window.localStorage.getItem(draftStorageKey(CREATE_CONTEXT))).toBeNull();

    rerender({
      context: CREATE_CONTEXT,
      snapshot: { title: 'Pie' },
      dirty: true,
      onIssue: undefined,
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
      await import('./draft-storage');
    });

    expect(window.localStorage.getItem(draftStorageKey(CREATE_CONTEXT))).toBe(
      serializeDraft({ title: 'Pie' }),
    );
  });

  it('flushes the latest dirty snapshot before navigation', async () => {
    const { result, rerender } = renderDraft({ snapshot: { title: 'Pi' }, dirty: true });
    await flushDraftModule();
    rerender({
      context: CREATE_CONTEXT,
      snapshot: { title: 'Pie' },
      dirty: true,
      onIssue: undefined,
    });

    await act(async () => result.current.flush());

    expect(window.localStorage.getItem(draftStorageKey(CREATE_CONTEXT))).toBe(
      serializeDraft({ title: 'Pie' }),
    );
  });

  it('does not overwrite an unresolved restore offer', async () => {
    const storageKey = draftStorageKey(CREATE_CONTEXT);
    const savedAt = Date.now();
    window.localStorage.setItem(storageKey, serializeDraft({ title: 'original' }, savedAt));

    const { result } = renderDraft({ snapshot: { title: 'typed-over' }, dirty: true });
    await flushDraftModule();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.availableDraft).toEqual({ title: 'original' });
    expect(window.localStorage.getItem(storageKey)).toBe(
      serializeDraft({ title: 'original' }, savedAt),
    );
  });

  it('restores or discards without mixing the persisted value', async () => {
    const storageKey = draftStorageKey(CREATE_CONTEXT);
    window.localStorage.setItem(storageKey, serializeDraft({ title: 'saved' }));
    const { result } = renderDraft();
    await flushDraftModule();

    expect(result.current.availableDraft).toEqual({ title: 'saved' });
    act(() => result.current.acceptDraft());
    expect(result.current.availableDraft).toBeNull();
    expect(window.localStorage.getItem(storageKey)).not.toBeNull();

    act(() => result.current.discardDraft());
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it('cancels a pending write when a successful save clears the draft', () => {
    const storageKey = draftStorageKey(CREATE_CONTEXT);
    const { result } = renderDraft({ snapshot: { title: 'saved' }, dirty: true });

    act(() => result.current.clear());
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it.each([
    ['malformed', '{not json'],
    [
      'incompatible',
      JSON.stringify({ version: DRAFT_SCHEMA_VERSION + 1, savedAt: Date.now(), data: {} }),
    ],
    ['expired', serializeDraft({ title: 'old' }, Date.now() - DRAFT_TTL_MS - 1)],
  ])('removes and reports a %s draft', async (issue, stored) => {
    const onIssue = vi.fn();
    const storageKey = draftStorageKey(CREATE_CONTEXT);
    window.localStorage.setItem(storageKey, stored);

    const { result } = renderDraft({ onIssue });
    await flushDraftModule();

    expect(result.current.availableDraft).toBeNull();
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(onIssue).toHaveBeenCalledWith(issue);
  });

  it('reports blocked storage explicitly and keeps the editor usable', async () => {
    const onIssue = vi.fn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    const { result } = renderDraft({ onIssue });
    await flushDraftModule();

    expect(result.current.availableDraft).toBeNull();
    expect(onIssue).toHaveBeenCalledWith('storage-unavailable');
  });

  it('protects dirty unloads and suppresses the prompt after navigation is allowed', () => {
    const { result } = renderDraft({ snapshot: { title: 'Pie' }, dirty: true });
    const blocked = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    act(() => result.current.allowNavigation());
    const allowed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });

  it('does not protect a pristine unload', () => {
    renderDraft();
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('offers cross-tab updates when pristine and preserves local dirty work', async () => {
    const onIssue = vi.fn();
    const { result, rerender } = renderDraft({ onIssue });
    const storageKey = draftStorageKey(CREATE_CONTEXT);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey,
          newValue: serializeDraft({ title: 'other tab' }),
        }),
      );
    });
    await flushDraftModule();
    expect(result.current.availableDraft).toEqual({ title: 'other tab' });

    act(() => result.current.discardDraft());
    rerender({
      context: CREATE_CONTEXT,
      snapshot: { title: 'local changes' },
      dirty: true,
      onIssue,
    });
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey,
          newValue: serializeDraft({ title: 'newer other tab' }),
        }),
      );
    });
    await flushDraftModule();

    expect(result.current.availableDraft).toBeNull();
    expect(onIssue).toHaveBeenCalledWith('cross-tab-conflict');
  });
});
