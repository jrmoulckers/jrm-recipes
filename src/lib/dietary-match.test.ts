import { describe, expect, it } from "vitest";

import {
  hasAllergenConflict,
  isRecipeSafeFor,
  meetsDiets,
  type MemberNeeds,
} from "./dietary-match";

describe("hasAllergenConflict", () => {
  it("is false when the member avoids nothing", () => {
    expect(hasAllergenConflict([], ["peanut", "dairy"])).toBe(false);
  });

  it("is true when the recipe carries an avoided allergen", () => {
    expect(hasAllergenConflict(["peanut"], ["dairy", "peanut"])).toBe(true);
  });

  it("is false when none of the avoided allergens are present", () => {
    expect(hasAllergenConflict(["shellfish"], ["dairy", "wheat"])).toBe(false);
  });
});

describe("meetsDiets", () => {
  it("is satisfied when the member follows no diet", () => {
    expect(meetsDiets([], [])).toBe(true);
    expect(meetsDiets([], ["vegan"])).toBe(true);
  });

  it("requires the recipe to declare every diet the member follows", () => {
    expect(meetsDiets(["vegan"], ["vegan", "gluten-free"])).toBe(true);
    expect(meetsDiets(["vegan", "gluten-free"], ["vegan"])).toBe(false);
  });

  it("fails closed when the recipe declares no flags", () => {
    expect(meetsDiets(["vegetarian"], [])).toBe(false);
  });
});

describe("isRecipeSafeFor", () => {
  const nutAllergicVegan: MemberNeeds = {
    allergens: ["peanut", "tree-nut"],
    diets: ["vegan"],
  };

  it("is safe when no allergen conflicts and all diets are met", () => {
    expect(
      isRecipeSafeFor(nutAllergicVegan, {
        allergens: ["soy"],
        dietaryFlags: ["vegan", "gluten-free"],
      }),
    ).toBe(true);
  });

  it("is unsafe when an avoided allergen is present, even if the diet matches", () => {
    expect(
      isRecipeSafeFor(nutAllergicVegan, {
        allergens: ["peanut"],
        dietaryFlags: ["vegan"],
      }),
    ).toBe(false);
  });

  it("is unsafe when the diet isn't declared, even with no allergen conflict", () => {
    expect(
      isRecipeSafeFor(nutAllergicVegan, {
        allergens: [],
        dietaryFlags: [],
      }),
    ).toBe(false);
  });

  it("treats a member with no restrictions as safe for anything", () => {
    expect(
      isRecipeSafeFor(
        { allergens: [], diets: [] },
        { allergens: ["peanut", "dairy"], dietaryFlags: [] },
      ),
    ).toBe(true);
  });
});
