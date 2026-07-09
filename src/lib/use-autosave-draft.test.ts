import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  draftStorageKey,
  useAutosaveDraft,
} from "./use-autosave-draft";

type Draft = { title: string };

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAutosaveDraft (#421)", () => {
  it("offers a previously saved draft on mount", () => {
    window.localStorage.setItem(
      draftStorageKey("new"),
      JSON.stringify({ title: "Grandma's stew" }),
    );

    const { result } = renderHook(() =>
      useAutosaveDraft<Draft>({
        key: "new",
        snapshot: { title: "" },
        dirty: false,
      }),
    );

    expect(result.current.availableDraft).toEqual({ title: "Grandma's stew" });
  });

  it("debounce-saves the snapshot once dirty and no draft is pending", () => {
    const { result, rerender } = renderHook(
      ({ snapshot, dirty }) =>
        useAutosaveDraft<Draft>({ key: "new", snapshot, dirty, debounceMs: 500 }),
      { initialProps: { snapshot: { title: "Pi" }, dirty: true } },
    );

    expect(result.current.availableDraft).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(window.localStorage.getItem(draftStorageKey("new"))).toBe(
      JSON.stringify({ title: "Pi" }),
    );

    rerender({ snapshot: { title: "Pie" }, dirty: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(window.localStorage.getItem(draftStorageKey("new"))).toBe(
      JSON.stringify({ title: "Pie" }),
    );
  });

  it("does not persist while an unresolved draft is offered", () => {
    window.localStorage.setItem(
      draftStorageKey("r1"),
      JSON.stringify({ title: "original" }),
    );

    const { result } = renderHook(() =>
      useAutosaveDraft<Draft>({
        key: "r1",
        snapshot: { title: "typed-over" },
        dirty: true,
        debounceMs: 200,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    // The offered draft is untouched until the user resolves it.
    expect(window.localStorage.getItem(draftStorageKey("r1"))).toBe(
      JSON.stringify({ title: "original" }),
    );

    act(() => result.current.acceptDraft());
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(window.localStorage.getItem(draftStorageKey("r1"))).toBe(
      JSON.stringify({ title: "typed-over" }),
    );
  });

  it("clear() and discardDraft() remove the stored draft", () => {
    window.localStorage.setItem(
      draftStorageKey("new"),
      JSON.stringify({ title: "x" }),
    );
    const { result } = renderHook(() =>
      useAutosaveDraft<Draft>({
        key: "new",
        snapshot: { title: "x" },
        dirty: false,
      }),
    );

    act(() => result.current.discardDraft());
    expect(result.current.availableDraft).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey("new"))).toBeNull();
  });
});
