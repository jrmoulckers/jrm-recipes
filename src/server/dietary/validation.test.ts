import { describe, expect, it } from "vitest";

import { memberProfileInput } from "./validation";

describe("memberProfileInput", () => {
  it("accepts a minimal profile and defaults the lists", () => {
    const parsed = memberProfileInput.parse({ name: "  Theo  " });
    expect(parsed).toMatchObject({
      name: "Theo",
      allergens: [],
      diets: [],
    });
    expect(parsed.calorieGoal).toBeUndefined();
    expect(parsed.groupId).toBeUndefined();
  });

  it("requires a name", () => {
    expect(() => memberProfileInput.parse({ name: "   " })).toThrow();
  });

  it("accepts and dedupes shared allergen + diet values", () => {
    const parsed = memberProfileInput.parse({
      name: "Sam",
      allergens: ["peanut", "peanut", "shellfish"],
      diets: ["vegetarian", "vegetarian"],
    });
    expect(parsed.allergens).toEqual(["peanut", "shellfish"]);
    expect(parsed.diets).toEqual(["vegetarian"]);
  });

  it("rejects values that would drift from the shared unions", () => {
    expect(() =>
      memberProfileInput.parse({ name: "Bad", allergens: ["gluten"] }),
    ).toThrow();
    expect(() =>
      memberProfileInput.parse({ name: "Bad", diets: ["keto"] }),
    ).toThrow();
  });

  it("coerces a calorie goal from a form string", () => {
    expect(
      memberProfileInput.parse({ name: "Ana", calorieGoal: "1800" })
        .calorieGoal,
    ).toBe(1800);
    expect(
      memberProfileInput.parse({ name: "Ana", calorieGoal: "" }).calorieGoal,
    ).toBeUndefined();
  });

  it("rejects a non-integer or out-of-range calorie goal", () => {
    expect(() =>
      memberProfileInput.parse({ name: "Bad", calorieGoal: "-5" }),
    ).toThrow();
    expect(() =>
      memberProfileInput.parse({ name: "Bad", calorieGoal: "20001" }),
    ).toThrow();
    expect(() =>
      memberProfileInput.parse({ name: "Bad", calorieGoal: "12.5" }),
    ).toThrow();
  });

  it("treats a blank group as unscoped", () => {
    expect(
      memberProfileInput.parse({ name: "Ana", groupId: "   " }).groupId,
    ).toBeUndefined();
  });
});
