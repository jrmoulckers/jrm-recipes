import { describe, expect, it } from "vitest";

import { isFlagEnabled, resolveFlag } from "./flags";

describe("resolveFlag", () => {
  it("returns the fallback (control) when analytics is off / map is empty", () => {
    expect(resolveFlag(undefined, "empty-library-cta", "control")).toBe(
      "control",
    );
    expect(resolveFlag({}, "empty-library-cta", "control")).toBe("control");
    // Default fallback is false (boolean off).
    expect(resolveFlag({}, "some-flag")).toBe(false);
  });

  it("returns the evaluated value when present (boolean or variant)", () => {
    expect(resolveFlag({ "new-nav": true }, "new-nav", false)).toBe(true);
    expect(
      resolveFlag(
        { "empty-library-cta": "benefit" },
        "empty-library-cta",
        "control",
      ),
    ).toBe("benefit");
  });

  it("does not treat a falsy-but-present value as absent", () => {
    expect(resolveFlag({ "new-nav": false }, "new-nav", true)).toBe(false);
  });
});

describe("isFlagEnabled", () => {
  it("treats any non-false value as enabled (covers variants)", () => {
    expect(isFlagEnabled(true)).toBe(true);
    expect(isFlagEnabled("variant-a")).toBe(true);
    // An empty-string variant is still a present, non-false assignment.
    expect(isFlagEnabled("")).toBe(true);
  });

  it("treats false / undefined as control", () => {
    expect(isFlagEnabled(false)).toBe(false);
    expect(isFlagEnabled(undefined)).toBe(false);
  });
});
