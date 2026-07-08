import { describe, expect, it } from "vitest";

import {
  convertTemperature,
  convertUnit,
  defaultSystemForLocale,
  displayUnit,
  formatQuantity,
  normalizeUnit,
  scaleQuantity,
  toSystem,
  toSystemRange,
  unitDimension,
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

  it("defaults to the app default locale (Western digits, dot decimal)", () => {
    expect(formatQuantity(1.2)).toBe("1.2");
    expect(formatQuantity(1.5, "ml")).toBe("1.5");
  });

  it("uses the locale's decimal separator for comma-decimal locales", () => {
    expect(formatQuantity(1.2, undefined, "de-DE")).toBe("1,2");
    expect(formatQuantity(1.5, "ml", "de-DE")).toBe("1,5");
    // Whole numbers gain no thousands separator (grouping is disabled).
    expect(formatQuantity(237, "ml", "de-DE")).toBe("237");
  });

  it("uses the locale's numbering system for non-Latin-digit locales", () => {
    const out = formatQuantity(1.2, undefined, "ar");
    // Arabic-Indic digits, not Western — and different from the en rendering.
    expect(out).not.toBe("1.2");
    expect(out).toMatch(/[\u0660-\u0669]/);
    expect(formatQuantity(3, undefined, "ar")).toMatch(/[\u0660-\u0669]/);
  });

  it("keeps vulgar-fraction glyphs invariant, localizing only the whole part", () => {
    expect(formatQuantity(0.5, "cup", "de-DE")).toBe("½");
    expect(formatQuantity(2.5, "oz", "de-DE")).toBe("2½");
    expect(formatQuantity(0.5, "cup", "ar")).toBe("½");
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

describe("temperature (#249)", () => {
  it("recognizes temperature units and aliases", () => {
    expect(unitDimension("°F")).toBe("temperature");
    expect(unitDimension("°C")).toBe("temperature");
    expect(unitDimension("fahrenheit")).toBe("temperature");
    expect(unitDimension("Celsius")).toBe("temperature");
    expect(unitDimension("centigrade")).toBe("temperature");
    expect(normalizeUnit("Fahrenheit")).toBe("°F");
    expect(normalizeUnit("celsius")).toBe("°C");
  });

  it("keeps the bare \"c\" alias meaning cups, not Celsius", () => {
    expect(normalizeUnit("c")).toBe("cup");
    expect(unitDimension("c")).toBe("volume");
  });

  it("converts Fahrenheit↔Celsius affinely and rounds to whole degrees", () => {
    expect(convertTemperature(350, "°F", "°C")).toBe(177);
    expect(convertTemperature(180, "°C", "°F")).toBe(356);
    expect(convertTemperature(212, "°F", "°C")).toBe(100);
    expect(convertTemperature(0, "°C", "°F")).toBe(32);
    expect(convertTemperature(425, "fahrenheit", "celsius")).toBe(218);
  });

  it("returns the same value for identical units and null across dimensions", () => {
    expect(convertTemperature(350, "°F", "°F")).toBe(350);
    expect(convertTemperature(1, "°C", "g")).toBeNull();
    expect(convertUnit(1, "°C", "cup")).toBeNull();
  });

  it("routes temperature through convertUnit's affine path", () => {
    expect(convertUnit(350, "°F", "°C")).toBe(177);
    expect(convertUnit(100, "°C", "°F")).toBe(212);
  });

  it("selects °F for US and °C for metric via toSystem", () => {
    expect(toSystem(180, "°C", "us")).toEqual({ quantity: 356, unit: "°F" });
    expect(toSystem(350, "°F", "metric")).toEqual({ quantity: 177, unit: "°C" });
    // Already in the target system: value unchanged, unit canonicalized.
    expect(toSystem(350, "°F", "us")).toEqual({ quantity: 350, unit: "°F" });
  });

  it("formats temperatures as plain locale-aware decimals, never fractions", () => {
    expect(formatQuantity(350, "°F")).toBe("350");
    expect(formatQuantity(177, "°C")).toBe("177");
    // Large temperatures round to whole degrees; small ones keep one decimal
    // and honor the locale separator.
    expect(formatQuantity(212.5, "°C")).toBe("213");
    expect(formatQuantity(4.5, "°C", "de-DE")).toBe("4,5");
    expect(displayUnit("°C", 200)).toBe("°C");
  });
});

describe("defaultSystemForLocale (#246)", () => {
  it("maps US and US-adjacent locales to imperial", () => {
    expect(defaultSystemForLocale("en")).toBe("us");
    expect(defaultSystemForLocale("en-US")).toBe("us");
  });

  it("maps other locales to metric", () => {
    expect(defaultSystemForLocale("de")).toBe("metric");
    expect(defaultSystemForLocale("de-DE")).toBe("metric");
    expect(defaultSystemForLocale("ar")).toBe("metric");
    expect(defaultSystemForLocale("es")).toBe("metric");
    expect(defaultSystemForLocale("en-GB")).toBe("metric");
  });

  it("falls back to metric for unparseable locales", () => {
    expect(defaultSystemForLocale("")).toBe("metric");
    expect(defaultSystemForLocale("not a locale!!")).toBe("metric");
  });
});
