import { describe, expect, it } from "vitest";

import { DERIVED_DIETARY_TAGS, deriveDietaryTags } from "./dietary-derive";

describe("deriveDietaryTags", () => {
  it("returns no tags for an empty ingredient list", () => {
    expect(deriveDietaryTags([])).toEqual([]);
  });

  it("tags a plain-vegetable recipe as all three -free diets", () => {
    expect(deriveDietaryTags(["carrot", "olive oil", "salt", "rice"])).toEqual([
      "dairy-free",
      "gluten-free",
      "egg-free",
    ]);
  });

  it("does NOT tag a recipe with butter as dairy-free", () => {
    const tags = deriveDietaryTags(["2 cups flour", "1 stick butter", "sugar"]);
    expect(tags).not.toContain("dairy-free");
  });

  it("does NOT tag a recipe with flour as gluten-free", () => {
    expect(deriveDietaryTags(["all-purpose flour", "water"])).not.toContain(
      "gluten-free",
    );
  });

  it("does NOT tag a recipe with eggs as egg-free", () => {
    expect(deriveDietaryTags(["3 large eggs", "milk"])).not.toContain(
      "egg-free",
    );
  });

  it("disqualifies gluten-free via a hidden wheat source (soy sauce)", () => {
    const tags = deriveDietaryTags(["chicken", "soy sauce", "scallions"]);
    expect(tags).not.toContain("gluten-free");
  });

  it("keeps unrelated -free tags when only one allergen is present", () => {
    // Butter carries dairy only: still gluten-free and egg-free.
    const tags = deriveDietaryTags(["butter", "carrots"]);
    expect(tags).toEqual(["gluten-free", "egg-free"]);
  });

  it("only ever derives the three detectable -free tags", () => {
    expect(DERIVED_DIETARY_TAGS).toEqual([
      "dairy-free",
      "gluten-free",
      "egg-free",
    ]);
    // A meat recipe is never auto-tagged vegan/vegetarian.
    const tags = deriveDietaryTags(["steak", "salt", "pepper"]);
    expect(tags).not.toContain("vegan");
    expect(tags).not.toContain("vegetarian");
  });
});
