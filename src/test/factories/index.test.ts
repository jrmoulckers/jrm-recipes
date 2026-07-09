import { describe, expect, it } from "vitest";

import { recipeInput, ingredientInput, stepInput } from "~/server/recipes/validation";
import {
  makeFullRecipe,
  makeIngredientInput,
  makeRecipe,
  makeRecipeInput,
  makeStepInput,
  makeUser,
  resetFactories,
  uniqueId,
} from "./index";

describe("test-data factories (#224)", () => {
  it("makeRecipeInput() parses cleanly through recipeInput", () => {
    const parsed = recipeInput.safeParse(makeRecipeInput());
    expect(parsed.success).toBe(true);
  });

  it("makeRecipeInput() with children still parses cleanly", () => {
    const input = makeRecipeInput({
      title: "Loaf",
      visibility: "public",
      ingredients: [makeIngredientInput(), makeIngredientInput({ item: "Water" })],
      steps: [makeStepInput(), makeStepInput({ instruction: "Bake it." })],
      tags: ["bread"],
    });
    const parsed = recipeInput.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("makeIngredientInput() and makeStepInput() parse against their schemas", () => {
    expect(ingredientInput.safeParse(makeIngredientInput()).success).toBe(true);
    expect(stepInput.safeParse(makeStepInput()).success).toBe(true);
  });

  it("overrides merge shallowly and win over defaults", () => {
    const user = makeUser({ id: "abc", name: "Nana" });
    expect(user.id).toBe("abc");
    expect(user.name).toBe("Nana");
    // Untouched defaults survive.
    expect(user.weeklyDigestOptIn).toBe(false);
  });

  it("uses deterministic ids by default", () => {
    expect(makeUser().id).toBe("user_1");
    expect(makeRecipe().id).toBe("recipe_1");
    // A second call with no override is identical (no hidden global drift).
    expect(makeUser()).toEqual(makeUser());
  });

  it("uniqueId() yields distinct, stable-after-reset ids", () => {
    resetFactories();
    const a = uniqueId("user");
    const b = uniqueId("user");
    expect(a).not.toBe(b);
    resetFactories();
    expect(uniqueId("user")).toBe(a);
  });

  it("makeFullRecipe() carries ordered children and joined tags", () => {
    const full = makeFullRecipe();
    expect(full.ingredients.map((i) => i.position)).toEqual([0, 1]);
    expect(full.steps.map((s) => s.position)).toEqual([0, 1]);
    expect(full.tags[0]?.tag.name).toBe("Dessert");
  });
});
