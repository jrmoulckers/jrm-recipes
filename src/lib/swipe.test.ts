import { describe, expect, it } from "vitest";

import { resolveSwipe, resolveTapZone } from "./swipe";

describe("resolveSwipe (#400)", () => {
  it("reads a right-to-left swipe as next and left-to-right as previous", () => {
    expect(resolveSwipe(-80, 5)).toBe("next");
    expect(resolveSwipe(80, -5)).toBe("previous");
  });

  it("ignores short drags below the threshold", () => {
    expect(resolveSwipe(-20, 0)).toBeNull();
    expect(resolveSwipe(40, 0)).toBeNull();
  });

  it("ignores gestures dominated by vertical movement (scrolling)", () => {
    expect(resolveSwipe(-60, 120)).toBeNull();
    expect(resolveSwipe(60, -100)).toBeNull();
  });

  it("honours a custom threshold", () => {
    expect(resolveSwipe(-30, 0, { threshold: 24 })).toBe("next");
    expect(resolveSwipe(-30, 0, { threshold: 100 })).toBeNull();
  });
});

describe("resolveTapZone (#400)", () => {
  const left = 100;
  const width = 300; // thirds at 100-200 / 200-300 / 300-400

  it("maps the left third to previous and the right third to next", () => {
    expect(resolveTapZone(120, left, width)).toBe("previous");
    expect(resolveTapZone(380, left, width)).toBe("next");
  });

  it("leaves the dead middle third alone", () => {
    expect(resolveTapZone(250, left, width)).toBeNull();
  });

  it("returns null for a zero-width element", () => {
    expect(resolveTapZone(120, left, 0)).toBeNull();
  });

  it("treats the exact boundaries as their outer zone", () => {
    expect(resolveTapZone(200, left, width)).toBe("previous"); // ratio 1/3
    expect(resolveTapZone(300, left, width)).toBe("next"); // ratio 2/3
  });
});
