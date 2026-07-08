import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useReducedMotion } from "./use-reduced-motion";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type Listener = () => void;

/** A minimal, controllable matchMedia stub (jsdom ships none). */
function mockMatchMedia(reduced: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: reduced,
    media: MOTION_QUERY,
    onchange: null,
    addEventListener: (_type: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_type: string, cb: Listener) => listeners.delete(cb),
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
    dispatchEvent: () => true,
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    set(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("useReducedMotion (issue #110)", () => {
  it("is false when nothing opts out of motion", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("is true when the OS prefers reduced motion", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("is true when the in-app data-motion=reduced toggle is on", () => {
    mockMatchMedia(false);
    document.documentElement.setAttribute("data-motion", "reduced");
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("is true in Simple/barebones mode even when the OS is neutral", () => {
    mockMatchMedia(false);
    document.documentElement.setAttribute("data-theme", "barebones");
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("lets an explicit in-app opt-out (data-motion=off) beat the OS", () => {
    mockMatchMedia(true);
    document.documentElement.setAttribute("data-motion", "off");
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("reacts live to a data-motion attribute change", async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => {
      document.documentElement.setAttribute("data-motion", "reduced");
      // Let the MutationObserver microtask deliver before asserting.
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it("reacts live to an OS media-query change", () => {
    const mq = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => mq.set(true));
    expect(result.current).toBe(true);
  });
});
