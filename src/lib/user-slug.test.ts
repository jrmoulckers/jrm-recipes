import { describe, expect, it } from "vitest";

import { RESERVED_RECIPE_SLUGS } from "~/lib/recipe-reserved-slugs";
import {
  isReservedUserSlug,
  isValidUserSlug,
  opaqueUserSlug,
  RESERVED_USER_SLUGS,
  USER_SLUG_MAX_LENGTH,
  userSlugBase,
} from "~/lib/user-slug";

describe("RESERVED_USER_SLUGS", () => {
  it("reserves every static sibling route under /recipes/*", () => {
    // A user slug is the first segment under /recipes, so anything that would
    // shadow a static route must be unavailable. Inherited rather than
    // duplicated so a new static sibling can't be forgotten here.
    for (const slug of RESERVED_RECIPE_SLUGS) {
      expect(isReservedUserSlug(slug)).toBe(true);
    }
  });

  it("reserves the share-link and infrastructure prefixes", () => {
    expect(isReservedUserSlug("r")).toBe(true);
    expect(isReservedUserSlug("api")).toBe(true);
    expect(isReservedUserSlug("admin")).toBe(true);
    expect(isReservedUserSlug("www")).toBe(true);
  });

  it("leaves ordinary slugs available", () => {
    expect(isReservedUserSlug("gran-lucia")).toBe(false);
    expect(RESERVED_USER_SLUGS.has("gran-lucia")).toBe(false);
  });
});

describe("userSlugBase", () => {
  it("lowercases and hyphenates", () => {
    expect(userSlugBase("Gran Lucia")).toBe("gran-lucia");
  });

  it("drops quotes rather than turning them into separators", () => {
    expect(userSlugBase("O'Brien")).toBe("obrien");
  });

  it("collapses runs of separators and trims the ends", () => {
    expect(userSlugBase("  --Aunt   Rosa!!  ")).toBe("aunt-rosa");
  });

  it("caps at the column width without leaving a trailing hyphen", () => {
    const base = userSlugBase(`${"a".repeat(59)} bcd`);
    expect(base).not.toBeNull();
    expect(base!.length).toBeLessThanOrEqual(USER_SLUG_MAX_LENGTH);
    expect(base!.endsWith("-")).toBe(false);
  });

  it("returns null when nothing usable survives", () => {
    // Callers fall back to an opaque slug; this never invents one.
    expect(userSlugBase("日本語")).toBeNull();
    expect(userSlugBase("---")).toBeNull();
    expect(userSlugBase("")).toBeNull();
  });
});

describe("isValidUserSlug", () => {
  it("accepts a well-formed slug", () => {
    expect(isValidUserSlug("gran-lucia")).toBe(true);
    expect(isValidUserSlug("cook123")).toBe(true);
  });

  it("rejects reserved slugs", () => {
    expect(isValidUserSlug("new")).toBe(false);
    expect(isValidUserSlug("r")).toBe(false);
  });

  it("rejects anything that isn't a clean single segment", () => {
    expect(isValidUserSlug("Gran-Lucia")).toBe(false);
    expect(isValidUserSlug("gran lucia")).toBe(false);
    expect(isValidUserSlug("gran/lucia")).toBe(false);
    expect(isValidUserSlug("-gran")).toBe(false);
    expect(isValidUserSlug("gran-")).toBe(false);
    expect(isValidUserSlug("gran--lucia")).toBe(false);
    expect(isValidUserSlug("")).toBe(false);
  });

  it("rejects a slug longer than the column", () => {
    expect(isValidUserSlug("a".repeat(USER_SLUG_MAX_LENGTH))).toBe(true);
    expect(isValidUserSlug("a".repeat(USER_SLUG_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("opaqueUserSlug", () => {
  it("produces a valid, non-identifying slug", () => {
    const slug = opaqueUserSlug("k3f9d2ab");
    expect(slug).toBe("cook-k3f9d2ab");
    expect(isValidUserSlug(slug)).toBe(true);
  });
});
