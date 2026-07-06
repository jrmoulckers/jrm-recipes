import { describe, expect, it } from "vitest";

import { cookedTimesLabel, formatServingsMade } from "./summary";

describe("cookedTimesLabel", () => {
  it("describes small counts in words", () => {
    expect(cookedTimesLabel(0)).toBe("Not cooked yet");
    expect(cookedTimesLabel(1)).toBe("Cooked once");
    expect(cookedTimesLabel(2)).toBe("Cooked twice");
    expect(cookedTimesLabel(3)).toBe("Cooked 3 times");
    expect(cookedTimesLabel(12)).toBe("Cooked 12 times");
  });

  it("guards against negative, fractional, and non-finite input", () => {
    expect(cookedTimesLabel(-4)).toBe("Not cooked yet");
    expect(cookedTimesLabel(2.9)).toBe("Cooked twice");
    expect(cookedTimesLabel(Number.NaN)).toBe("Not cooked yet");
  });
});

describe("formatServingsMade", () => {
  it("pluralizes and returns null when unknown", () => {
    expect(formatServingsMade(1)).toBe("1 serving");
    expect(formatServingsMade(4)).toBe("4 servings");
    expect(formatServingsMade(null)).toBeNull();
    expect(formatServingsMade(undefined)).toBeNull();
    expect(formatServingsMade(0)).toBeNull();
  });
});
