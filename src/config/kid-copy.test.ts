import { describe, expect, it } from "vitest";

import { KID_COPY, pickCopy, pickKidCopy } from "~/config/kid-copy";

describe("kid-copy", () => {
  it("returns the fallback when kidSafe is off", () => {
    expect(pickKidCopy(false, "cta.create", "Create a recipe")).toBe(
      "Create a recipe",
    );
  });

  it("returns the kid variant when kidSafe is on", () => {
    expect(pickKidCopy(true, "cta.create", "Create a recipe")).toBe(
      KID_COPY["cta.create"],
    );
  });

  it("maps the active theme to kidSafe behavior", () => {
    expect(pickCopy("kids", "empty.recipes.title", "No recipes yet")).toBe(
      KID_COPY["empty.recipes.title"],
    );
    expect(pickCopy("kitchen", "empty.recipes.title", "No recipes yet")).toBe(
      "No recipes yet",
    );
  });

  it("keeps kid variants short and concrete", () => {
    for (const value of Object.values(KID_COPY)) {
      // Grade-2 friendly: short strings, no long clauses.
      expect(value.length).toBeLessThanOrEqual(32);
    }
  });
});
