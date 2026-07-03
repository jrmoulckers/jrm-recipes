import { describe, expect, it } from "vitest";

import {
  convertUnit,
  displayUnit,
  formatQuantity,
  normalizeUnit,
  scaleQuantity,
  toSystem,
} from "./units";

describe("formatQuantity", () => {
  it("formats common fractions with vulgar glyphs", () => {
    expect(formatQuantity(0.5)).toBe("½");
    expect(formatQuantity(1.25)).toBe("1¼");
    expect(formatQuantity(2 + 2 / 3)).toBe("2⅔");
  });

  it("formats whole numbers, zero, nullish values, and decimals", () => {
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(null)).toBe("");
    expect(formatQuantity(Number.NaN)).toBe("");
    expect(formatQuantity(1.2)).toBe("1.2");
  });
});

describe("scaleQuantity", () => {
  it("scales quantities with cooking-friendly rounding", () => {
    expect(scaleQuantity(1.3333, 3)).toBe(4);
    expect(scaleQuantity(0.1, 3)).toBe(0.3);
  });

  it("preserves nullable quantities", () => {
    expect(scaleQuantity(null, 2)).toBeNull();
    expect(scaleQuantity(undefined, 2)).toBeNull();
  });
});

describe("convertUnit", () => {
  it("converts compatible units and round-trips through base dimensions", () => {
    expect(convertUnit(1, "cup", "tbsp")).toBe(16);
    expect(convertUnit(16, "tbsp", "cup")).toBe(1);
    expect(convertUnit(1, "kg", "g")).toBe(1000);
    expect(convertUnit(1000, "g", "kg")).toBe(1);
  });

  it("returns null for unknown or incompatible units", () => {
    expect(convertUnit(1, "cup", "g")).toBeNull();
    expect(convertUnit(1, "pinch", "tsp")).toBeNull();
  });
});

describe("toSystem", () => {
  it("chooses friendly US and metric units on each ladder", () => {
    expect(toSystem(3, "tsp", "us")).toEqual({ quantity: 1, unit: "tbsp" });
    expect(toSystem(2000, "ml", "metric")).toEqual({
      quantity: 2,
      unit: "l",
    });
    expect(toSystem(1, "cup", "metric")).toEqual({
      quantity: 236.588,
      unit: "ml",
    });
    expect(toSystem(1, "kg", "us")).toEqual({ quantity: 2.205, unit: "lb" });
  });

  it("leaves unknown units unchanged and returns null without a unit", () => {
    expect(toSystem(1.2345, "pinch", "metric")).toEqual({
      quantity: 1.235,
      unit: "pinch",
    });
    expect(toSystem(1, null, "metric")).toBeNull();
  });
});

describe("displayUnit", () => {
  it("uses canonical display labels and configured plurals", () => {
    expect(displayUnit("cup", 1)).toBe("cup");
    expect(displayUnit("cup", 2)).toBe("cups");
    expect(displayUnit("lb", 2)).toBe("lb");
    expect(displayUnit("Tablespoons", 3)).toBe("tbsp");
    expect(displayUnit(null, 3)).toBe("");
  });
});

describe("normalizeUnit", () => {
  it("canonicalizes known units and trims unknown units", () => {
    expect(normalizeUnit(" Tablespoons ")).toBe("tbsp");
    expect(normalizeUnit("cups")).toBe("cup");
    expect(normalizeUnit("millilitres")).toBe("ml");
    expect(normalizeUnit(" pinch ")).toBe("pinch");
    expect(normalizeUnit(undefined)).toBeNull();
  });
});
