import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECIPE_SORT,
  defaultSortFor,
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
      cuisines: [],
      difficulty: undefined,
      maxTime: undefined,
      tags: [],
      sort: "newest",
    });
  });

  it("trims text and drops empty strings", () => {
    expect(parseRecipeSearch({ q: "  pasta  ", cuisine: "" })).toMatchObject({
      q: "pasta",
      cuisines: [],
    });
  });

  it("parses repeated and comma-joined facets into de-duped lists (#271)", () => {
    expect(
      parseRecipeSearch({ tag: ["weeknight", "vegan,Weeknight"] }).tags,
    ).toEqual(["weeknight", "vegan"]);
    expect(
      parseRecipeSearch({ cuisine: "Mexican, Thai , mexican" }).cuisines,
    ).toEqual(["Mexican", "Thai"]);
  });

  it("keeps a single facet value back-compatible (#271)", () => {
    expect(parseRecipeSearch({ tag: "quick" }).tags).toEqual(["quick"]);
    expect(parseRecipeSearch({ cuisine: "Italian" }).cuisines).toEqual([
      "Italian",
    ]);
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

  it("defaults to relevance for a text query, newest otherwise (#260)", () => {
    // No explicit sort + a query → "Best match" leads.
    expect(parseRecipeSearch({ q: "chicken" })).toMatchObject({
      sort: "relevance",
    });
    // No explicit sort + no query → classic newest browse.
    expect(parseRecipeSearch({})).toMatchObject({ sort: "newest" });
    // An explicit sort always wins over the contextual default.
    expect(parseRecipeSearch({ q: "chicken", sort: "az" })).toMatchObject({
      sort: "az",
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

  it("omits the contextual default sort but keeps an explicit one (#260)", () => {
    // relevance is the implicit default when a query is present → omitted.
    expect(
      recipeSearchToParams({ q: "chicken", sort: "relevance" }).get("sort"),
    ).toBeNull();
    // newest is the implicit default for a bare browse → omitted.
    expect(recipeSearchToParams({ sort: "newest" }).get("sort")).toBeNull();
    // A non-default sort alongside a query is preserved.
    expect(
      recipeSearchToParams({ q: "chicken", sort: "top-rated" }).get("sort"),
    ).toBe("top-rated");
  });

  it("serializes the set values", () => {
    const qs = recipeSearchToQueryString({
      q: "taco",
      cuisines: ["Mexican"],
      difficulty: "easy",
      maxTime: 30,
      tags: ["weeknight"],
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

  it("serializes multi-select facets as repeated params (#271)", () => {
    const params = recipeSearchToParams({
      cuisines: ["Mexican", "Thai"],
      tags: ["vegan", "weeknight"],
    });
    expect(params.getAll("cuisine")).toEqual(["Mexican", "Thai"]);
    expect(params.getAll("tag")).toEqual(["vegan", "weeknight"]);
  });

  it("round-trips multi-select facets through parseRecipeSearch (#271)", () => {
    const original = parseRecipeSearch({
      cuisine: ["Mexican", "Thai"],
      tag: ["vegan", "weeknight"],
    });
    const params = recipeSearchToParams(original);
    const reparsed = parseRecipeSearch({
      cuisine: params.getAll("cuisine"),
      tag: params.getAll("tag"),
    });
    expect(reparsed).toEqual(original);
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

describe("defaultSortFor", () => {
  it("is relevance with a query, newest without one", () => {
    expect(defaultSortFor("pasta")).toBe("relevance");
    expect(defaultSortFor("")).toBe("newest");
    expect(defaultSortFor(undefined)).toBe("newest");
    expect(defaultSortFor(null)).toBe(DEFAULT_RECIPE_SORT);
  });
});
