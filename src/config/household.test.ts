import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOUSEHOLD,
  MAX_HOUSEHOLD,
  MIN_HOUSEHOLD,
  clampHouseholdSize,
  parseHousehold,
  serializeHousehold,
} from "./household";

describe("clampHouseholdSize", () => {
  it("rounds fractional sizes to whole people", () => {
    expect(clampHouseholdSize(4.4)).toBe(4);
    expect(clampHouseholdSize(4.6)).toBe(5);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampHouseholdSize(0)).toBe(MIN_HOUSEHOLD);
    expect(clampHouseholdSize(-3)).toBe(MIN_HOUSEHOLD);
    expect(clampHouseholdSize(999)).toBe(MAX_HOUSEHOLD);
  });
});

describe("parseHousehold", () => {
  it("returns null when unset so behavior is unchanged", () => {
    expect(parseHousehold(null)).toBeNull();
    expect(parseHousehold(undefined)).toBeNull();
    expect(parseHousehold("")).toBeNull();
    expect(parseHousehold("   ")).toBeNull();
  });

  it("returns null for non-numeric or non-positive values", () => {
    expect(parseHousehold("five")).toBeNull();
    expect(parseHousehold("0")).toBeNull();
    expect(parseHousehold("-2")).toBeNull();
  });

  it("parses and clamps a valid size", () => {
    expect(parseHousehold("5")).toBe(5);
    expect(parseHousehold("100")).toBe(MAX_HOUSEHOLD);
    expect(parseHousehold("3.5")).toBe(4);
  });
});

describe("serializeHousehold", () => {
  it("round-trips through parseHousehold", () => {
    expect(parseHousehold(serializeHousehold(5))).toBe(5);
    expect(parseHousehold(serializeHousehold(DEFAULT_HOUSEHOLD))).toBe(
      DEFAULT_HOUSEHOLD,
    );
  });

  it("clamps out-of-range input on the way out", () => {
    expect(serializeHousehold(0)).toBe(String(MIN_HOUSEHOLD));
    expect(serializeHousehold(50)).toBe(String(MAX_HOUSEHOLD));
  });
});
