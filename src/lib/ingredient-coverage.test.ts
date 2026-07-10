import { describe, expect, it } from "vitest";

import {
  coverageFor,
  ingredientTokens,
  rankByCoverage,
} from "./ingredient-coverage";

describe("ingredientTokens (#277)", () => {
  it("normalizes case, punctuation, and simple plurals", () => {
    expect(ingredientTokens("2 Boneless Chicken Breasts")).toEqual(
      expect.arrayContaining(["boneless", "chicken", "breast"]),
    );
    expect(ingredientTokens("Tomatoes")).toEqual(["tomato"]);
    expect(ingredientTokens("eggs")).toEqual(["egg"]);
  });
});

describe("coverageFor (#277)", () => {
  const pantry = [["chicken"], ["rice"], ["spinach"]];

  it("counts an ingredient as covered when a pantry item's tokens all appear", () => {
    const cov = coverageFor(
      ["boneless chicken breast", "white rice", "olive oil", "black pepper"],
      pantry,
    );
    expect(cov).toEqual({ matched: 2, total: 4, missing: 2 });
  });

  it("does not partial-match unrelated words that merely share a stem", () => {
    // "salt" must not cover "salted butter".
    const cov = coverageFor(["salted butter"], [["salt"]]);
    expect(cov.matched).toBe(0);
  });
});

describe("rankByCoverage (#277)", () => {
  it("ranks more matches higher, breaking ties by fewer missing", () => {
    const ranked = rankByCoverage(
      [
        { id: "one-of-two", ingredients: ["chicken", "saffron"] },
        {
          id: "two-of-three",
          ingredients: ["chicken", "rice", "cardamom"],
        },
        { id: "two-of-two", ingredients: ["chicken", "rice"] },
        { id: "zero", ingredients: ["tofu", "miso"] },
      ],
      ["chicken", "rice"],
    );
    expect(ranked.map((r) => r.id)).toEqual([
      "two-of-two", // 2 matched, 0 missing
      "two-of-three", // 2 matched, 1 missing
      "one-of-two", // 1 matched
    ]);
    // Zero-match recipes are dropped entirely.
    expect(ranked.some((r) => r.id === "zero")).toBe(false);
  });

  it("returns [] when the pantry is empty", () => {
    expect(rankByCoverage([{ id: "a", ingredients: ["chicken"] }], [])).toEqual(
      [],
    );
  });
});
