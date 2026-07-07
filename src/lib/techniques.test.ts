import { describe, expect, it } from "vitest";

import {
  allTechniques,
  getTechnique,
  lookupTechnique,
  suggestTechnique,
  TECHNIQUES,
} from "./techniques";

describe("lookupTechnique", () => {
  it("resolves an exact slug to its canonical entry", () => {
    const match = lookupTechnique("saute");
    expect(match).toMatchObject({
      slug: "saute",
      label: "Sauté",
      known: true,
    });
    expect(match.shortTip).toBe(TECHNIQUES.saute!.shortTip);
    expect(match.description).toBe(TECHNIQUES.saute!.description);
  });

  it("is case-insensitive", () => {
    expect(lookupTechnique("DICE")).toMatchObject({ slug: "dice", known: true });
    expect(lookupTechnique("Braise")).toMatchObject({
      slug: "braise",
      known: true,
    });
  });

  it("ignores accents so 'sauté' matches 'saute'", () => {
    expect(lookupTechnique("Sauté")).toMatchObject({
      slug: "saute",
      label: "Sauté",
      known: true,
    });
    expect(lookupTechnique("purée")).toMatchObject({
      slug: "puree",
      known: true,
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(lookupTechnique("   mince   ")).toMatchObject({
      slug: "mince",
      known: true,
    });
  });

  it("resolves gerund and past-tense forms", () => {
    expect(lookupTechnique("dicing")).toMatchObject({ slug: "dice" });
    expect(lookupTechnique("reduced")).toMatchObject({ slug: "reduce" });
    expect(lookupTechnique("searing")).toMatchObject({ slug: "sear" });
    expect(lookupTechnique("caramelising")).toMatchObject({ slug: "caramelize" });
    expect(lookupTechnique("whisked")).toMatchObject({ slug: "whisk" });
  });

  it("resolves curated aliases and alternate spellings", () => {
    expect(lookupTechnique("caramelise")).toMatchObject({ slug: "caramelize" });
    expect(lookupTechnique("reduction")).toMatchObject({ slug: "reduce" });
    expect(lookupTechnique("marinade")).toMatchObject({ slug: "marinate" });
    expect(lookupTechnique("fold in")).toMatchObject({ slug: "fold" });
    expect(lookupTechnique("matchsticks")).toMatchObject({ slug: "julienne" });
  });

  it("returns the raw label gracefully for unknown techniques", () => {
    const match = lookupTechnique("Spherify");
    expect(match.known).toBe(false);
    expect(match.label).toBe("Spherify");
    expect(match.slug).toBe("spherify");
    expect(match.shortTip).toBeUndefined();
    expect(match.description).toBeUndefined();
  });

  it("handles empty and whitespace-only labels without throwing", () => {
    expect(lookupTechnique("")).toMatchObject({ known: false, label: "" });
    expect(lookupTechnique("   ")).toMatchObject({ known: false, label: "" });
  });

  it("builds a hyphenated slug for unknown multi-word labels", () => {
    expect(lookupTechnique("Sous Vide")).toMatchObject({
      known: false,
      slug: "sous-vide",
      label: "Sous Vide",
    });
  });
});

describe("suggestTechnique", () => {
  it("suggests the closest known technique for a typo", () => {
    expect(suggestTechnique("braize")).toEqual({ slug: "braise", label: "Braise" });
    expect(suggestTechnique("minse")).toEqual({ slug: "mince", label: "Mince" });
    expect(suggestTechnique("wisk")).toEqual({ slug: "whisk", label: "Whisk" });
  });

  it("returns null for genuinely novel or far-off techniques", () => {
    expect(suggestTechnique("spherify")).toBeNull();
    expect(suggestTechnique("ferment")).toBeNull();
  });

  it("returns null for very short or empty input", () => {
    expect(suggestTechnique("")).toBeNull();
    expect(suggestTechnique("ab")).toBeNull();
  });

  it("does not second-guess an already-known label", () => {
    expect(suggestTechnique("braise")).toBeNull();
    expect(suggestTechnique("dicing")).toBeNull();
  });
});

describe("lookupTechnique typo hints", () => {
  it("attaches a suggestion to an unknown but near-miss label", () => {
    const match = lookupTechnique("braize");
    expect(match.known).toBe(false);
    expect(match.suggestion).toEqual({ slug: "braise", label: "Braise" });
  });

  it("omits a suggestion when a label is already known", () => {
    expect(lookupTechnique("braise").suggestion).toBeUndefined();
  });

  it("omits a suggestion when nothing is close enough", () => {
    expect(lookupTechnique("spherify").suggestion).toBeUndefined();
  });
});

describe("getTechnique", () => {
  it("returns a technique by slug", () => {
    expect(getTechnique("knead")?.name).toBe("Knead");
  });

  it("resolves via an alias", () => {
    expect(getTechnique("sieve")?.slug).toBe("sift");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getTechnique("nope")).toBeUndefined();
  });
});

describe("technique knowledge base integrity", () => {
  const entries = allTechniques();

  it("exposes a healthy number of techniques", () => {
    expect(entries.length).toBeGreaterThanOrEqual(25);
  });

  it("covers every technique named in the feature brief", () => {
    const required = [
      "dice",
      "mince",
      "saute",
      "deglaze",
      "fold",
      "blanch",
      "sear",
      "caramelize",
      "proof",
      "temper",
      "braise",
      "emulsify",
      "whisk",
      "knead",
      "zest",
      "julienne",
      "simmer",
      "reduce",
      "cream",
      "sift",
      "marinate",
      "rest",
    ];
    for (const slug of required) {
      expect(TECHNIQUES[slug], `missing technique: ${slug}`).toBeDefined();
    }
  });

  it("gives every entry a matching slug, name, tip, and description", () => {
    for (const technique of entries) {
      expect(technique.slug).toMatch(/^[a-z]+$/);
      expect(technique.name.length).toBeGreaterThan(0);
      expect(technique.shortTip.length).toBeGreaterThan(0);
      expect(technique.description.length).toBeGreaterThan(0);
      // Keys in the record must match each entry's own slug.
      expect(TECHNIQUES[technique.slug]).toBe(technique);
    }
  });

  it("round-trips every entry through lookupTechnique by name", () => {
    for (const technique of entries) {
      expect(lookupTechnique(technique.name)).toMatchObject({
        slug: technique.slug,
        known: true,
      });
    }
  });
});
