import { afterEach, describe, expect, it, vi } from "vitest";

import { HAPTICS, vibrate } from "./haptics";

const originalDescriptor = Object.getOwnPropertyDescriptor(
  window.navigator,
  "vibrate",
);

function setVibrate(value: unknown) {
  Object.defineProperty(window.navigator, "vibrate", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(window.navigator, "vibrate", originalDescriptor);
  } else {
    // jsdom has no vibrate by default — remove whatever a test installed.
    delete (window.navigator as { vibrate?: unknown }).vibrate;
  }
  vi.restoreAllMocks();
});

describe("vibrate (issue #80)", () => {
  it("calls navigator.vibrate with the pattern when motion is allowed", () => {
    const spy = vi.fn(() => true);
    setVibrate(spy);

    const result = vibrate(HAPTICS.timerComplete, () => false);

    expect(spy).toHaveBeenCalledWith(HAPTICS.timerComplete);
    expect(result).toBe(true);
  });

  it("no-ops when reduced motion is preferred", () => {
    const spy = vi.fn(() => true);
    setVibrate(spy);

    const result = vibrate(HAPTICS.stepNav, () => true);

    expect(spy).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("safely no-ops (no throw) when navigator.vibrate is unavailable", () => {
    setVibrate(undefined);

    expect(() => vibrate(HAPTICS.select, () => false)).not.toThrow();
    expect(vibrate(HAPTICS.select, () => false)).toBe(false);
  });

  it("swallows errors thrown by navigator.vibrate", () => {
    setVibrate(() => {
      throw new Error("boom");
    });

    expect(vibrate(HAPTICS.select, () => false)).toBe(false);
  });
});
