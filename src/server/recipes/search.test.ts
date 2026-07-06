import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECIPE_SORT,
  hasActiveRecipeFilters,
  isDefaultRecipeView,
  parseRecipeSearch,
  recipeSearchToParams,
  recipeSearchToQueryString,
  tagFilterSlug,
} from "./search";

describe("parseRecipeSearch", () => {
  it("returns defaults for empty params", () => {
    expect(parseRecipeSearch({})).toEqual({
      q: undefined,
      cuisine: undefined,
      difficulty: undefined,
      maxTime: undefined,
      tag: undefined,
      sort: "newest",
    });
  });

  it("trims text and drops empty strings", () => {
    expect(parseRecipeSearch({ q: "  pasta  ", cuisine: "" })).toMatchObject({
      q: "pasta",
      cuisine: undefined,
    });
  });

  it("takes the first value when a param repeats", () => {
    expect(parseRecipeSearch({ q: ["first", "second"] })).toMatchObject({
      q: "first",
    });
  });

  it("keeps valid enum values and falls back on invalid ones", () => {
    expect(parseRecipeSearch({ difficulty: "medium" })).toMatchObject({
      difficulty: "medium",
    });
    expect(parseRecipeSearch({ difficulty: "extreme" })).toMatchObject({
      difficulty: undefined,
    });
  });

  it("keeps valid sorts and falls back to the default for invalid ones", () => {
    expect(parseRecipeSearch({ sort: "quickest" })).toMatchObject({
      sort: "quickest",
    });
    expect(parseRecipeSearch({ sort: "top-rated" })).toMatchObject({
      sort: "top-rated",
    });
    expect(parseRecipeSearch({ sort: "bogus" })).toMatchObject({
      sort: DEFAULT_RECIPE_SORT,
    });
  });

  it("coerces maxTime and rejects junk", () => {
    expect(parseRecipeSearch({ maxTime: "45" })).toMatchObject({ maxTime: 45 });
    expect(parseRecipeSearch({ maxTime: "45.9" })).toMatchObject({
      maxTime: 45,
    });
    expect(parseRecipeSearch({ maxTime: "0" })).toMatchObject({
      maxTime: undefined,
    });
    expect(parseRecipeSearch({ maxTime: "-10" })).toMatchObject({
      maxTime: undefined,
    });
    expect(parseRecipeSearch({ maxTime: "abc" })).toMatchObject({
      maxTime: undefined,
    });
  });
});

describe("hasActiveRecipeFilters / isDefaultRecipeView", () => {
  it("is inactive for a bare default search", () => {
    const search = parseRecipeSearch({});
    expect(hasActiveRecipeFilters(search)).toBe(false);
    expect(isDefaultRecipeView(search)).toBe(true);
  });

  it("detects an active filter", () => {
    const search = parseRecipeSearch({ tag: "weeknight" });
    expect(hasActiveRecipeFilters(search)).toBe(true);
    expect(isDefaultRecipeView(search)).toBe(false);
  });

  it("treats a non-default sort as a customized (non-default) view", () => {
    const search = parseRecipeSearch({ sort: "az" });
    expect(hasActiveRecipeFilters(search)).toBe(false);
    expect(isDefaultRecipeView(search)).toBe(false);
  });
});

describe("recipeSearchToParams", () => {
  it("omits empty values and the default sort", () => {
    expect(recipeSearchToParams(parseRecipeSearch({})).toString()).toBe("");
  });

  it("serializes the set values", () => {
    const qs = recipeSearchToQueryString({
      q: "taco",
      cuisine: "Mexican",
      difficulty: "easy",
      maxTime: 30,
      tag: "weeknight",
      sort: "quickest",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("q")).toBe("taco");
    expect(params.get("cuisine")).toBe("Mexican");
    expect(params.get("difficulty")).toBe("easy");
    expect(params.get("maxTime")).toBe("30");
    expect(params.get("tag")).toBe("weeknight");
    expect(params.get("sort")).toBe("quickest");
  });

  it("round-trips through parseRecipeSearch", () => {
    const original = parseRecipeSearch({
      q: "soup",
      difficulty: "hard",
      maxTime: "60",
      sort: "az",
    });
    const reparsed = parseRecipeSearch(
      Object.fromEntries(recipeSearchToParams(original)),
    );
    expect(reparsed).toEqual(original);
  });
});

describe("tagFilterSlug", () => {
  it("slugifies free-text tags", () => {
    expect(tagFilterSlug("Kid Friendly")).toBe("kid-friendly");
    expect(tagFilterSlug("Grandma's")).toBe("grandmas");
  });
});
