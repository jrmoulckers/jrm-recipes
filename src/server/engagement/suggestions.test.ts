import { describe, expect, it } from "vitest";

import { contributorLabel, mergeSuggestionIntoNotes } from "./suggestions";

describe("mergeSuggestionIntoNotes", () => {
  it("uses the suggestion alone when the recipe has no notes yet", () => {
    expect(mergeSuggestionIntoNotes(null, "Add a bay leaf", "Nonna")).toBe(
      "Add a bay leaf — suggested by Nonna",
    );
  });

  it("appends the suggestion after existing notes as its own paragraph", () => {
    expect(
      mergeSuggestionIntoNotes("Simmer low and slow.", "Add a bay leaf", "Nonna"),
    ).toBe("Simmer low and slow.\n\nAdd a bay leaf — suggested by Nonna");
  });

  it("trims surrounding whitespace on both the notes and the suggestion", () => {
    expect(
      mergeSuggestionIntoNotes("  Simmer low.  ", "  Add a bay leaf  ", "Nonna"),
    ).toBe("Simmer low.\n\nAdd a bay leaf — suggested by Nonna");
  });

  it("leaves the notes untouched when the suggestion is empty", () => {
    expect(mergeSuggestionIntoNotes("Simmer low.", "   ", "Nonna")).toBe(
      "Simmer low.",
    );
  });

  it("falls back to a friendly contributor when none is given", () => {
    expect(mergeSuggestionIntoNotes(null, "Add a bay leaf", "  ")).toBe(
      "Add a bay leaf — suggested by a family cook",
    );
  });
});

describe("contributorLabel", () => {
  it("prefers a name, then a handle, then a friendly fallback", () => {
    expect(contributorLabel({ name: "Nonna", handle: "nonna" })).toBe("Nonna");
    expect(contributorLabel({ name: null, handle: "rae" })).toBe("rae");
    expect(contributorLabel({ name: "  ", handle: null })).toBe("a family cook");
    expect(contributorLabel(null)).toBe("a family cook");
  });
});
