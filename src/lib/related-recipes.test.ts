import { describe, expect, it } from "vitest";

import {
  rankBySimilarity,
  similarityScore,
  tokenizeIngredients,
  type RecipeSignals,
} from "./related-recipes";

const empty: RecipeSignals = {
  tagSlugs: [],
  cuisine: null,
  ingredientTokens: [],
};

describe("similarityScore (#275)", () => {
  it("rewards shared tags most heavily", () => {
    const source: RecipeSignals = {
      tagSlugs: ["quick", "vegan"],
      cuisine: "Italian",
      ingredientTokens: [],
    };
    const twoTags = similarityScore(source, {
      tagSlugs: ["quick", "vegan"],
      cuisine: null,
      ingredientTokens: [],
    });
    const oneTag = similarityScore(source, {
      tagSlugs: ["quick"],
      cuisine: null,
      ingredientTokens: [],
    });
    expect(twoTags).toBeGreaterThan(oneTag);
  });

  it("counts a matching cuisine (case-insensitively)", () => {
    const source: RecipeSignals = {
      tagSlugs: [],
      cuisine: "Thai",
      ingredientTokens: [],
    };
    expect(
      similarityScore(source, {
        tagSlugs: [],
        cuisine: "thai",
        ingredientTokens: [],
      }),
    ).toBe(2);
    expect(similarityScore(source, empty)).toBe(0);
  });

  it("caps ingredient overlap so pantry staples can't dominate a shared tag", () => {
    const source: RecipeSignals = {
      tagSlugs: ["dessert"],
      cuisine: null,
      ingredientTokens: ["salt", "sugar", "flour", "butter", "eggs"],
    };
    const manyIngredients = similarityScore(source, {
      tagSlugs: [],
      cuisine: null,
      ingredientTokens: ["salt", "sugar", "flour", "butter", "eggs"],
    });
    const oneTag = similarityScore(source, {
      tagSlugs: ["dessert"],
      cuisine: null,
      ingredientTokens: [],
    });
    expect(oneTag).toBeGreaterThan(manyIngredients);
  });
});

describe("rankBySimilarity (#275)", () => {
  const source: RecipeSignals = {
    tagSlugs: ["quick", "vegan"],
    cuisine: "Italian",
    ingredientTokens: [],
  };

  it("ranks a recipe sharing 2 tags above one sharing 0", () => {
    const ranked = rankBySimilarity(
      source,
      [
        {
          id: "no-overlap",
          signals: {
            tagSlugs: ["bbq"],
            cuisine: "American",
            ingredientTokens: [],
          },
        },
        {
          id: "two-tags",
          signals: {
            tagSlugs: ["quick", "vegan"],
            cuisine: null,
            ingredientTokens: [],
          },
        },
      ],
      5,
    );
    expect(ranked.map((r) => r.id)).toEqual(["two-tags"]);
  });

  it("drops zero-score candidates and respects the limit", () => {
    const ranked = rankBySimilarity(
      source,
      [
        {
          id: "a",
          signals: { tagSlugs: ["quick"], cuisine: null, ingredientTokens: [] },
        },
        {
          id: "b",
          signals: { tagSlugs: ["vegan"], cuisine: null, ingredientTokens: [] },
        },
        {
          id: "c",
          signals: {
            tagSlugs: ["unrelated"],
            cuisine: null,
            ingredientTokens: [],
          },
        },
      ],
      1,
    );
    expect(ranked).toHaveLength(1);
    expect(["a", "b"]).toContain(ranked[0]!.id);
  });
});

describe("tokenizeIngredients (#275)", () => {
  it("lowercases, splits on non-alphanumerics, and drops short words", () => {
    expect(
      tokenizeIngredients(["2 cups All-Purpose Flour", "a bit of Salt"]),
    ).toEqual(
      expect.arrayContaining([
        "cups",
        "all",
        "purpose",
        "flour",
        "bit",
        "salt",
      ]),
    );
    expect(tokenizeIngredients(["a of"])).toEqual([]);
  });
});
