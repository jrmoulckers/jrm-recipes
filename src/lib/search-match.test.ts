import { describe, expect, it } from "vitest";

import { deriveMatchReason, splitHighlight } from "./search-match";

describe("deriveMatchReason", () => {
  const base = {
    title: "Sunday Pasta",
    description: "A slow ragu",
    cuisine: "Italian",
    tags: ["weeknight", "comfort"],
    ingredients: ["pancetta", "spaghetti", "pecorino"],
  };

  it("returns null when there is no query", () => {
    expect(deriveMatchReason(base, undefined)).toBeNull();
    expect(deriveMatchReason(base, "")).toBeNull();
  });

  it("prefers a title match", () => {
    expect(deriveMatchReason(base, "pasta")).toEqual({
      field: "title",
      term: "pasta",
    });
  });

  it("explains an ingredient-only match", () => {
    // "carbonara" isn't in the title, but the recipe surfaced via an ingredient.
    expect(deriveMatchReason(base, "pancetta")).toEqual({
      field: "ingredient",
      term: "pancetta",
    });
  });

  it("explains matches via a synonym of the query", () => {
    const recipe = { title: "Herb Salsa", ingredients: ["fresh cilantro"] };
    expect(deriveMatchReason(recipe, "coriander")).toEqual({
      field: "ingredient",
      term: "cilantro",
    });
  });

  it("falls back through tag, cuisine, then description", () => {
    expect(deriveMatchReason(base, "comfort")).toEqual({
      field: "tag",
      term: "comfort",
    });
    expect(deriveMatchReason(base, "italian")).toEqual({
      field: "cuisine",
      term: "italian",
    });
    expect(deriveMatchReason(base, "ragu")).toEqual({
      field: "description",
      term: "ragu",
    });
  });

  it("ignores 1-character tokens and unknown terms", () => {
    expect(deriveMatchReason(base, "x")).toBeNull();
    expect(deriveMatchReason(base, "sushi")).toBeNull();
  });
});

describe("splitHighlight", () => {
  it("marks case-insensitive matches and preserves the original casing", () => {
    expect(splitHighlight("Chicken Soup", "chicken")).toEqual([
      { text: "Chicken", hit: true },
      { text: " Soup", hit: false },
    ]);
  });

  it("handles multiple occurrences", () => {
    expect(splitHighlight("Pea and pea soup", "pea")).toEqual([
      { text: "Pea", hit: true },
      { text: " and ", hit: false },
      { text: "pea", hit: true },
      { text: " soup", hit: false },
    ]);
  });

  it("returns a single non-hit segment when the term is absent or too short", () => {
    expect(splitHighlight("Tacos", "pizza")).toEqual([
      { text: "Tacos", hit: false },
    ]);
    expect(splitHighlight("Tacos", "a")).toEqual([{ text: "Tacos", hit: false }]);
  });

  it("does not treat the term as HTML (XSS safe)", () => {
    const segments = splitHighlight("<b>x</b> soup", "<b>x</b>");
    expect(segments).toEqual([
      { text: "<b>x</b>", hit: true },
      { text: " soup", hit: false },
    ]);
    // Every segment is plain text sliced from the input — no markup is produced.
    expect(segments.map((s) => s.text).join("")).toBe("<b>x</b> soup");
  });
});
