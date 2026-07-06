import { describe, expect, it } from "vitest";

import { deleteCookLogInput, logCookInput } from "./validation";

describe("logCookInput", () => {
  it("keeps a bare entry and defaults optionals to undefined", () => {
    expect(
      logCookInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
      }),
    ).toEqual({
      recipeId: "recipe_1",
      recipeSlug: "sunday-sauce",
      note: undefined,
      photoUrl: undefined,
      servingsMade: undefined,
      cookedAt: undefined,
    });
  });

  it("trims the note and coerces empty optional fields to undefined", () => {
    expect(
      logCookInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        note: "  Added extra garlic.  ",
        photoUrl: "",
        servingsMade: "",
      }),
    ).toMatchObject({
      note: "Added extra garlic.",
      photoUrl: undefined,
      servingsMade: undefined,
    });
  });

  it("coerces a numeric servings string", () => {
    expect(
      logCookInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        servingsMade: "6",
      }),
    ).toMatchObject({ servingsMade: 6 });
  });

  it("parses a cookedAt string into a Date", () => {
    const parsed = logCookInput.parse({
      recipeId: "recipe_1",
      recipeSlug: "sunday-sauce",
      cookedAt: "2024-01-02T10:00:00.000Z",
    });
    expect(parsed.cookedAt).toBeInstanceOf(Date);
    expect(parsed.cookedAt?.toISOString()).toBe("2024-01-02T10:00:00.000Z");
  });

  it("drops an unparseable cookedAt instead of throwing", () => {
    expect(
      logCookInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        cookedAt: "not-a-date",
      }).cookedAt,
    ).toBeUndefined();
  });

  it("rejects missing ids, bad photo URLs, and non-positive servings", () => {
    expect(() =>
      logCookInput.parse({ recipeId: " ", recipeSlug: "sunday-sauce" }),
    ).toThrow();
    expect(() =>
      logCookInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        photoUrl: "not a url",
      }),
    ).toThrow();
    expect(() =>
      logCookInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        servingsMade: "0",
      }),
    ).toThrow();
  });
});

describe("deleteCookLogInput", () => {
  it("requires a non-empty entry id and slug", () => {
    expect(
      deleteCookLogInput.parse({
        entryId: "entry_1",
        recipeSlug: "sunday-sauce",
      }),
    ).toEqual({ entryId: "entry_1", recipeSlug: "sunday-sauce" });
    expect(() =>
      deleteCookLogInput.parse({ entryId: "", recipeSlug: "sunday-sauce" }),
    ).toThrow();
  });
});
