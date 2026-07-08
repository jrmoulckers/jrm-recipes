import { describe, expect, it } from "vitest";

import {
  canonicalizeTag,
  isCanonicalTag,
  SUGGESTED_TAGS,
} from "./tag-taxonomy";

describe("canonicalizeTag (#282)", () => {
  it("folds known aliases onto their canonical tag", () => {
    expect(canonicalizeTag("veggie")).toEqual({
      slug: "vegetarian",
      name: "Vegetarian",
    });
    expect(canonicalizeTag("gf")).toEqual({
      slug: "gluten-free",
      name: "Gluten-Free",
    });
    expect(canonicalizeTag("bbq")).toEqual({
      slug: "barbecue",
      name: "Barbecue",
    });
    expect(canonicalizeTag("crockpot")).toEqual({
      slug: "slow-cooker",
      name: "Slow Cooker",
    });
    expect(canonicalizeTag("entree")).toEqual({
      slug: "main-course",
      name: "Main Course",
    });
  });

  it("is case- and spacing-insensitive", () => {
    expect(canonicalizeTag("  Gluten Free ").slug).toBe("gluten-free");
    expect(canonicalizeTag("WEEK NIGHT").slug).toBe("weeknight");
    expect(canonicalizeTag("Non-Dairy").slug).toBe("dairy-free");
  });

  it("maps a canonical name/slug to itself", () => {
    expect(canonicalizeTag("Vegetarian")).toEqual({
      slug: "vegetarian",
      name: "Vegetarian",
    });
    expect(canonicalizeTag("gluten-free").slug).toBe("gluten-free");
  });

  it("passes unknown free-form tags through with a normalized slug", () => {
    expect(canonicalizeTag("Grandma's Secret")).toEqual({
      slug: "grandmas-secret",
      name: "Grandma's Secret",
    });
    // Unknown tags are not forced into the vocabulary.
    expect(isCanonicalTag("Grandma's Secret")).toBe(false);
  });

  it("collapses distinct aliases to a single canonical slug", () => {
    const a = canonicalizeTag("veggie");
    const b = canonicalizeTag("Vegetarian");
    const c = canonicalizeTag("vegetarians");
    expect(new Set([a.slug, b.slug, c.slug]).size).toBe(1);
  });
});

describe("SUGGESTED_TAGS (#282)", () => {
  it("exposes a de-duplicated, alphabetized vocabulary", () => {
    const slugs = SUGGESTED_TAGS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const names = SUGGESTED_TAGS.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("every suggested tag canonicalizes to itself", () => {
    for (const tag of SUGGESTED_TAGS) {
      expect(canonicalizeTag(tag.name)).toEqual(tag);
      expect(isCanonicalTag(tag.name)).toBe(true);
    }
  });
});
