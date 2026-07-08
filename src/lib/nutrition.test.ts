import { describe, expect, it } from "vitest";

import {
  NUTRIENTS,
  formatNutrient,
  hasNutrition,
  nutritionRows,
  pickNutrition,
  scaleNutrition,
  type Nutrition,
} from "./nutrition";

const FULL: Nutrition = {
  calories: 540,
  proteinGrams: 42.5,
  carbsGrams: 3,
  fatGrams: 38,
  saturatedFatGrams: 11.2,
  sodiumMg: 620,
  sugarGrams: 1.5,
  fiberGrams: 0.5,
};

describe("hasNutrition", () => {
  it("is true when any nutrient has a finite value", () => {
    expect(hasNutrition({ calories: 100 })).toBe(true);
    expect(hasNutrition({ sodiumMg: 0 })).toBe(true); // zero is a real value
  });

  it("is false for empty, all-null, or non-finite records", () => {
    expect(hasNutrition({})).toBe(false);
    expect(hasNutrition({ calories: null, proteinGrams: null })).toBe(false);
    expect(hasNutrition({ calories: Number.NaN })).toBe(false);
  });
});

describe("pickNutrition", () => {
  it("extracts exactly the nutrition keys, coercing missing to null", () => {
    const row = { calories: 200, title: "ignored", proteinGrams: 9 } as never;
    const picked = pickNutrition(row);
    expect(picked).toEqual({
      calories: 200,
      proteinGrams: 9,
      carbsGrams: null,
      fatGrams: null,
      saturatedFatGrams: null,
      sodiumMg: null,
      sugarGrams: null,
      fiberGrams: null,
    });
    expect(Object.keys(picked)).toHaveLength(NUTRIENTS.length);
  });
});

describe("scaleNutrition", () => {
  it("multiplies present nutrients (whole-recipe = per-serving × servings)", () => {
    const whole = scaleNutrition(FULL, 4);
    expect(whole.calories).toBe(2160);
    expect(whole.proteinGrams).toBe(170);
    expect(whole.sodiumMg).toBe(2480);
  });

  it("returns per-serving unchanged at factor 1", () => {
    expect(scaleNutrition(FULL, 1)).toEqual(FULL);
  });

  it("keeps absent nutrients absent", () => {
    expect(scaleNutrition({ calories: 100 }, 2)).toEqual({
      calories: 200,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      saturatedFatGrams: null,
      sodiumMg: null,
      sugarGrams: null,
      fiberGrams: null,
    });
  });

  it("falls back to factor 1 for a non-finite or negative factor", () => {
    expect(scaleNutrition({ calories: 100 }, Number.NaN).calories).toBe(100);
    expect(scaleNutrition({ calories: 100 }, -3).calories).toBe(100);
  });

  it("handles fractional factors without double counting", () => {
    // Scaling 4 → 6 servings is factor 1.5 for whole-recipe totals.
    expect(scaleNutrition({ calories: 500 }, 1.5).calories).toBe(750);
  });
});

describe("nutritionRows", () => {
  it("returns present nutrients in Nutrition Facts label order", () => {
    const rows = nutritionRows(FULL).map((r) => r.key);
    expect(rows).toEqual([
      "calories",
      "fatGrams",
      "saturatedFatGrams",
      "sodiumMg",
      "carbsGrams",
      "fiberGrams",
      "sugarGrams",
      "proteinGrams",
    ]);
  });

  it("omits absent nutrients", () => {
    const rows = nutritionRows({ calories: 100, sodiumMg: 200 });
    expect(rows.map((r) => r.key)).toEqual(["calories", "sodiumMg"]);
  });
});

describe("formatNutrient", () => {
  it("rounds to the nutrient precision", () => {
    expect(formatNutrient(2160.0001, 0)).toBe("2,160");
    expect(formatNutrient(11.24, 1)).toBe("11.2");
    expect(formatNutrient(0.5, 1)).toBe("0.5");
  });

  it("drops trailing zeros so whole grams read cleanly", () => {
    expect(formatNutrient(38, 1)).toBe("38");
  });
});
