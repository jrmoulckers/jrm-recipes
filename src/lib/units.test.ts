import { describe, expect, it } from "vitest";

import {
  convertUnit,
  displayUnit,
  formatQuantity,
  normalizeUnit,
  scaleQuantity,
  toSystem,
  toSystemRange,
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

  it("formats metric quantities as measurable decimals, not vulgar fractions (ck06)", () => {
    // Awkward imperial→metric conversions must round to sensible precision and
    // render as decimals — never as a vulgar fraction of a gram/millilitre.
    expect(formatQuantity(28.35, "g")).toBe("28");
    expect(formatQuantity(14.17, "g")).toBe("14");
    expect(formatQuantity(236.588, "ml")).toBe("237");
    // Small amounts keep a single decimal place.
    expect(formatQuantity(0.5, "g")).toBe("0.5");
    expect(formatQuantity(4.92892, "ml")).toBe("4.9");
    expect(formatQuantity(1.183, "l")).toBe("1.2");
    // Metric aliases resolve the same way.
    expect(formatQuantity(0.5, "gram")).toBe("0.5");
    expect(formatQuantity(2.04, "kilogram")).toBe("2");
  });

  it("keeps imperial vulgar fractions and unit-less behavior unchanged (ck06)", () => {
    expect(formatQuantity(0.5, "cup")).toBe("½");
    expect(formatQuantity(1.25, "tbsp")).toBe("1¼");
    expect(formatQuantity(2.5, "oz")).toBe("2½");
    expect(formatQuantity(0.5)).toBe("½");
    expect(formatQuantity(0.5, "pinch")).toBe("½");
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

describe("toSystemRange", () => {
  it("converts both ends of a range to one consistent unit (ck01)", () => {
    // "2–3 cups" → metric: both ends land in ml, correctly paired.
    expect(toSystemRange(2, 3, "cup", "metric")).toEqual({
      quantity: 473.176,
      quantityMax: 709.764,
      unit: "ml",
    });
  });

  it("keeps the max on the min's chosen unit across a unit threshold (ck01)", () => {
    // 5 cups alone rounds up to litres; converting the range independently
    // would show the litre value beside the ml label. Both must stay ml.
    expect(toSystemRange(3, 5, "cup", "metric")).toEqual({
      quantity: 709.764,
      quantityMax: 1182.94,
      unit: "ml",
    });
  });

  it("handles mass ranges that cross a ladder step, sharing one unit", () => {
    expect(toSystemRange(1, 2, "kg", "us")).toEqual({
      quantity: 2.205,
      quantityMax: 4.409,
      unit: "lb",
    });
    // Range whose min is sub-1 in the shared unit.
    expect(toSystemRange(8, 20, "oz", "metric")).toEqual({
      quantity: 226.796,
      quantityMax: 566.99,
      unit: "g",
    });
  });

  it("returns a null max for single values and degenerate ranges", () => {
    expect(toSystemRange(2, null, "cup", "metric")).toEqual({
      quantity: 473.176,
      quantityMax: null,
      unit: "ml",
    });
    expect(toSystemRange(2, 2, "cup", "metric")).toEqual({
      quantity: 473.176,
      quantityMax: null,
      unit: "ml",
    });
    expect(toSystemRange(2, 1, "cup", "metric")).toEqual({
      quantity: 473.176,
      quantityMax: null,
      unit: "ml",
    });
  });

  it("leaves unknown units unchanged and returns null without a unit", () => {
    expect(toSystemRange(2, 3, "pinch", "metric")).toEqual({
      quantity: 2,
      quantityMax: 3,
      unit: "pinch",
    });
    expect(toSystemRange(1, 2, null, "metric")).toBeNull();
  });
});
