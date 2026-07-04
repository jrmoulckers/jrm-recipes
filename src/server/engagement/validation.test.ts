import { describe, expect, it } from "vitest";

import { commentInput, ratingInput } from "./validation";

describe("commentInput", () => {
  it("defaults comments to kind comment and trims the body", () => {
    expect(
      commentInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        body: "  Needs more basil.  ",
      }),
    ).toMatchObject({
      kind: "comment",
      body: "Needs more basil.",
    });
  });

  it("rejects empty comment bodies", () => {
    expect(() =>
      commentInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        body: "   ",
      }),
    ).toThrow();
  });
});

describe("ratingInput", () => {
  it("rejects ratings outside the star range", () => {
    expect(() =>
      ratingInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        value: 0,
      }),
    ).toThrow();
    expect(() =>
      ratingInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        value: 6,
      }),
    ).toThrow();
  });

  it("accepts one through five stars", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      expect(
        ratingInput.parse({
          recipeId: "recipe_1",
          recipeSlug: "sunday-sauce",
          value,
        }),
      ).toMatchObject({ value });
    }
  });
});
