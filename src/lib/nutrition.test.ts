import { describe, expect, it } from "vitest";

import {
  NUTRIENTS,
  assessDailyValue,
  caloriePercentOfGoal,
  classifyLevel,
  formatNutrient,
  hasNutrition,
  nutritionFlags,
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

describe("classifyLevel (5/20 rule)", () => {
  it("bands by %DV: ≤5 low, ≥20 high, else moderate", () => {
    expect(classifyLevel(5)).toBe("low");
    expect(classifyLevel(4.9)).toBe("low");
    expect(classifyLevel(12)).toBe("moderate");
    expect(classifyLevel(19.9)).toBe("moderate");
    expect(classifyLevel(20)).toBe("high");
    expect(classifyLevel(38)).toBe("high");
  });
});

describe("assessDailyValue", () => {
  it("computes sodium %DV against the 2300 mg Daily Value", () => {
    const flag = assessDailyValue({ sodiumMg: 874 }, "sodiumMg");
    expect(flag).toMatchObject({
      key: "sodiumMg",
      label: "Sodium",
      unit: "mg",
      amount: 874,
      percentDV: 38, // 874 / 2300 ≈ 38%
      level: "high",
    });
  });

  it("computes sugar %DV against the 50 g Daily Value", () => {
    const flag = assessDailyValue({ sugarGrams: 2 }, "sugarGrams");
    expect(flag).toMatchObject({ percentDV: 4, level: "low" });
  });

  it("derives the band from the exact ratio, not the rounded percent", () => {
    // 115 mg / 2300 = 5.0% exactly → low (boundary).
    expect(assessDailyValue({ sodiumMg: 115 }, "sodiumMg")?.level).toBe("low");
    // 116 mg / 2300 ≈ 5.04% → moderate even though it rounds to 5%.
    expect(assessDailyValue({ sodiumMg: 116 }, "sodiumMg")?.level).toBe(
      "moderate",
    );
  });

  it("returns null when the nutrient is absent", () => {
    expect(assessDailyValue({}, "sodiumMg")).toBeNull();
    expect(assessDailyValue({ sodiumMg: null }, "sodiumMg")).toBeNull();
  });
});

describe("nutritionFlags", () => {
  it("returns sodium and sugar flags when both exist, in order", () => {
    const flags = nutritionFlags({ sodiumMg: 900, sugarGrams: 30 });
    expect(flags.map((f) => f.key)).toEqual(["sodiumMg", "sugarGrams"]);
  });

  it("only surfaces flags whose values exist", () => {
    expect(nutritionFlags({ sodiumMg: 100 }).map((f) => f.key)).toEqual([
      "sodiumMg",
    ]);
    expect(nutritionFlags({ calories: 400 })).toEqual([]);
  });
});

describe("caloriePercentOfGoal", () => {
  it("returns the rounded share of the daily goal", () => {
    expect(caloriePercentOfGoal(500, 2000)).toBe(25);
    // 640 / 1800 = 35.5…% rounds to 36
    expect(caloriePercentOfGoal(640, 1800)).toBe(36);
  });

  it("treats zero calories as a legitimate 0%", () => {
    expect(caloriePercentOfGoal(0, 2000)).toBe(0);
  });

  it("hides (null) when calories are missing", () => {
    expect(caloriePercentOfGoal(null, 2000)).toBeNull();
    expect(caloriePercentOfGoal(undefined, 2000)).toBeNull();
  });

  it("hides (null) when the goal is missing or nonpositive", () => {
    expect(caloriePercentOfGoal(500, null)).toBeNull();
    expect(caloriePercentOfGoal(500, undefined)).toBeNull();
    expect(caloriePercentOfGoal(500, 0)).toBeNull();
    expect(caloriePercentOfGoal(500, -100)).toBeNull();
  });

  it("hides (null) for non-finite or negative inputs rather than NaN", () => {
    expect(caloriePercentOfGoal(Number.NaN, 2000)).toBeNull();
    expect(caloriePercentOfGoal(Infinity, 2000)).toBeNull();
    expect(caloriePercentOfGoal(-10, 2000)).toBeNull();
  });
});
