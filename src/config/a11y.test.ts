import { describe, expect, it } from "vitest";

import {
  DEFAULT_A11Y,
  a11yAttributes,
  isA11yActive,
  isTextSize,
  parseA11y,
  serializeA11y,
} from "./a11y";

describe("parseA11y", () => {
  it("returns defaults for empty or invalid input", () => {
    expect(parseA11y(null)).toEqual(DEFAULT_A11Y);
    expect(parseA11y(undefined)).toEqual(DEFAULT_A11Y);
    expect(parseA11y("not json")).toEqual(DEFAULT_A11Y);
  });

  it("coerces unknown fields to safe values", () => {
    const prefs = parseA11y(
      JSON.stringify({ textSize: "huge", contrast: "yes", motion: 1, reading: true }),
    );
    expect(prefs).toEqual({
      textSize: "default", // "huge" is not a valid size
      contrast: false, // only boolean true counts
      motion: false,
      reading: true,
    });
  });

  it("round-trips a fully-customized object", () => {
    const prefs = {
      textSize: "xl" as const,
      contrast: true,
      motion: true,
      reading: false,
    };
    expect(parseA11y(serializeA11y(prefs))).toEqual(prefs);
  });
});

describe("a11yAttributes", () => {
  it("omits attributes for default preferences", () => {
    expect(a11yAttributes(DEFAULT_A11Y)).toEqual({});
  });

  it("maps active preferences to <html> data-attributes", () => {
    expect(
      a11yAttributes({
        textSize: "large",
        contrast: true,
        motion: true,
        reading: true,
      }),
    ).toEqual({
      "data-text": "large",
      "data-contrast": "high",
      "data-motion": "reduced",
      "data-reading": "readable",
    });
  });
});

describe("isTextSize / isA11yActive", () => {
  it("validates text sizes", () => {
    expect(isTextSize("xl")).toBe(true);
    expect(isTextSize("enormous")).toBe(false);
  });

  it("detects whether any preference is non-default", () => {
    expect(isA11yActive(DEFAULT_A11Y)).toBe(false);
    expect(isA11yActive({ ...DEFAULT_A11Y, contrast: true })).toBe(true);
    expect(isA11yActive({ ...DEFAULT_A11Y, textSize: "large" })).toBe(true);
  });
});
