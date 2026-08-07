import { describe, expect, it } from "vitest";

import {
  ingredientAllergens,
  unionIngredientAllergens,
} from "./recipe-allergens";

describe("ingredientAllergens", () => {
  it("uses structured food-graph tokens when present (source of truth)", () => {
    // The free text ("butter") would text-detect dairy too, but the structured
    // value wins even when it disagrees. Proving structured is authoritative.
    expect(
      ingredientAllergens({ item: "butter", foodAllergens: ["soy"] }),
    ).toEqual(["soy"]);
  });

  it("treats an empty structured array as 'resolved, carries none' (suppresses text)", () => {
    // "peanut butter" would text-detect peanut, but a resolved food with [] wins.
    expect(
      ingredientAllergens({ item: "peanut butter", foodAllergens: [] }),
    ).toEqual([]);
  });

  it("falls back to text detection when structured tokens are null", () => {
    expect(
      ingredientAllergens({ item: "2 cups whole milk", foodAllergens: null }),
    ).toEqual(["dairy"]);
  });

  it("drops non-canonical tokens from the structured value", () => {
    expect(
      ingredientAllergens({
        item: "mystery",
        foodAllergens: ["dairy", "not-an-allergen"],
      }),
    ).toEqual(["dairy"]);
  });
});

describe("unionIngredientAllergens", () => {
  it("unions structured + text lines, de-duplicated and canonically sorted", () => {
    const result = unionIngredientAllergens([
      { item: "butter", foodAllergens: ["dairy"] },
      { item: "2 eggs", foodAllergens: null },
      { item: "soy sauce", foodAllergens: ["soy", "wheat"] },
      { item: "more butter", foodAllergens: ["dairy"] },
    ]);
    // canonical order: dairy, egg, soy, wheat, with dairy not duplicated.
    expect(result).toEqual(["dairy", "egg", "soy", "wheat"]);
  });

  it("returns [] for no ingredients", () => {
    expect(unionIngredientAllergens([])).toEqual([]);
  });
});
