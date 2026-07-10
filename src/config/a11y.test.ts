import { describe, expect, it } from "vitest";

import {
  DEFAULT_A11Y,
  a11yAttributes,
  isA11yActive,
  isTextSize,
  parseA11y,
  parseTriState,
  resolveTriState,
  serializeA11y,
} from "./a11y";

describe("parseA11y", () => {
  it("returns defaults (contrast/motion unset) for empty or invalid input", () => {
    expect(parseA11y(null)).toEqual(DEFAULT_A11Y);
    expect(parseA11y(undefined)).toEqual(DEFAULT_A11Y);
    expect(parseA11y("not json")).toEqual(DEFAULT_A11Y);
    // Unset means the field is absent, not `false`.
    expect(parseA11y(null).motion).toBeUndefined();
    expect(parseA11y(null).contrast).toBeUndefined();
  });

  it("coerces unknown contrast/motion values to unset (follow the OS)", () => {
    const prefs = parseA11y(
      JSON.stringify({
        textSize: "huge",
        contrast: "yes",
        motion: 1,
        reading: true,
      }),
    );
    expect(prefs).toEqual({
      textSize: "default", // "huge" is not a valid size
      contrast: undefined, // unknown -> unset
      motion: undefined, // unknown -> unset
      reading: true,
    });
  });

  it("treats a legacy boolean true as explicit on and false as unset", () => {
    // Old cookies persisted booleans; false was just the default, so it should
    // NOT become a hard opt-out (that would regress OS-follow for existing users).
    const prefs = parseA11y(JSON.stringify({ contrast: true, motion: false }));
    expect(prefs.contrast).toBe("on");
    expect(prefs.motion).toBeUndefined();
  });

  it("keeps an explicit off as off", () => {
    const prefs = parseA11y(JSON.stringify({ contrast: "off", motion: "off" }));
    expect(prefs.contrast).toBe("off");
    expect(prefs.motion).toBe("off");
  });

  it("round-trips a fully-customized object", () => {
    const prefs = {
      textSize: "xl" as const,
      contrast: "on" as const,
      motion: "off" as const,
      reading: false,
    };
    expect(parseA11y(serializeA11y(prefs))).toEqual(prefs);
  });
});

describe("parseTriState / resolveTriState", () => {
  it("normalizes stored values", () => {
    expect(parseTriState("on")).toBe("on");
    expect(parseTriState(true)).toBe("on");
    expect(parseTriState("off")).toBe("off");
    expect(parseTriState(false)).toBeUndefined();
    expect(parseTriState(undefined)).toBeUndefined();
    expect(parseTriState("maybe")).toBeUndefined();
  });

  it("lets an explicit choice win, else follows the system signal", () => {
    expect(resolveTriState("on", false)).toBe(true);
    expect(resolveTriState("off", true)).toBe(false);
    expect(resolveTriState(undefined, true)).toBe(true);
    expect(resolveTriState(undefined, false)).toBe(false);
  });
});

describe("a11yAttributes", () => {
  it("omits attributes for default/unset preferences", () => {
    expect(a11yAttributes(DEFAULT_A11Y)).toEqual({});
  });

  it("maps explicit-on preferences to <html> data-attributes", () => {
    expect(
      a11yAttributes({
        textSize: "large",
        contrast: "on",
        motion: "on",
        reading: true,
      }),
    ).toEqual({
      "data-text": "large",
      "data-contrast": "high",
      "data-motion": "reduced",
      "data-reading": "readable",
    });
  });

  it("writes an explicit off attribute so the OS media query can be gated", () => {
    expect(
      a11yAttributes({
        textSize: "default",
        contrast: "off",
        motion: "off",
        reading: false,
      }),
    ).toEqual({
      "data-contrast": "off",
      "data-motion": "off",
    });
  });
});

describe("isTextSize / isA11yActive", () => {
  it("validates text sizes", () => {
    expect(isTextSize("xl")).toBe(true);
    expect(isTextSize("enormous")).toBe(false);
  });

  it("detects whether any preference is explicitly set", () => {
    expect(isA11yActive(DEFAULT_A11Y)).toBe(false);
    expect(isA11yActive({ ...DEFAULT_A11Y, contrast: "on" })).toBe(true);
    // An explicit opt-out is still a customization.
    expect(isA11yActive({ ...DEFAULT_A11Y, motion: "off" })).toBe(true);
    expect(isA11yActive({ ...DEFAULT_A11Y, textSize: "large" })).toBe(true);
  });
});
