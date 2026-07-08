import { describe, expect, it } from "vitest";

import {
  expandQueryTerms,
  MAX_SYNONYM_EXPANSION,
  normalizeTerm,
  synonymsFor,
} from "./search-synonyms";

describe("normalizeTerm", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeTerm("  Green   Onion ")).toBe("green onion");
    expect(normalizeTerm("CILANTRO")).toBe("cilantro");
  });
});

describe("expandQueryTerms", () => {
  it("always includes the original normalized term first", () => {
    expect(expandQueryTerms("  Pasta ")[0]).toBe("pasta");
    expect(expandQueryTerms("nonexistent-ingredient")).toEqual([
      "nonexistent-ingredient",
    ]);
  });

  it("returns [] for an empty/whitespace query", () => {
    expect(expandQueryTerms("")).toEqual([]);
    expect(expandQueryTerms("   ")).toEqual([]);
  });

  it("expands a term to its synonyms bidirectionally (#270)", () => {
    // "coriander" finds "cilantro" and vice versa.
    expect(expandQueryTerms("coriander")).toContain("cilantro");
    expect(expandQueryTerms("cilantro")).toContain("coriander");
    // A few more regional pairs.
    expect(expandQueryTerms("aubergine")).toContain("eggplant");
    expect(expandQueryTerms("prawns")).toContain("shrimp");
    expect(expandQueryTerms("Green Onion")).toContain("scallion");
  });

  it("is case-insensitive", () => {
    expect(expandQueryTerms("Coriander")).toContain("cilantro");
  });

  it("caps the number of appended synonyms", () => {
    const capped = expandQueryTerms("scallion", 2);
    // original + at most 2 synonyms.
    expect(capped.length).toBeLessThanOrEqual(3);
    expect(capped[0]).toBe("scallion");
    // The default cap is enforced too.
    expect(expandQueryTerms("scallion").length).toBeLessThanOrEqual(
      1 + MAX_SYNONYM_EXPANSION,
    );
  });

  it("never duplicates the original within the synonyms", () => {
    const terms = expandQueryTerms("shrimp");
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe("synonymsFor", () => {
  it("returns the other members of a group, excluding the term itself", () => {
    const syn = synonymsFor("cilantro");
    expect(syn).toContain("coriander");
    expect(syn).not.toContain("cilantro");
  });

  it("returns [] for an unknown term", () => {
    expect(synonymsFor("quinoa")).toEqual([]);
  });
});
