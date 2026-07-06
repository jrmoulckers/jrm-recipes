import { describe, expect, it } from "vitest";

import {
  collectionInput,
  collectionRecipeInput,
  toggleFavoriteInput,
} from "./validation";

describe("collectionInput", () => {
  it("trims the name and optional text", () => {
    expect(
      collectionInput.parse({
        name: "  Weeknight Winners  ",
        description: "  Fast dinners the kids eat  ",
      }),
    ).toMatchObject({
      name: "Weeknight Winners",
      description: "Fast dinners the kids eat",
    });
  });

  it("coerces empty optional fields to undefined", () => {
    expect(
      collectionInput.parse({
        name: "Holiday Baking",
        description: "",
        coverImageUrl: "",
      }),
    ).toMatchObject({
      description: undefined,
      coverImageUrl: undefined,
    });
  });

  it("requires a name", () => {
    expect(() => collectionInput.parse({ name: "  " })).toThrow(
      /Name your collection/,
    );
  });

  it("rejects an invalid cover image url", () => {
    expect(() =>
      collectionInput.parse({ name: "Soups", coverImageUrl: "not-a-url" }),
    ).toThrow();
  });
});

describe("toggleFavoriteInput", () => {
  it("keeps the recipe id and optional slug", () => {
    expect(
      toggleFavoriteInput.parse({
        recipeId: "abc123",
        recipeSlug: "grandmas-marinara",
      }),
    ).toMatchObject({
      recipeId: "abc123",
      recipeSlug: "grandmas-marinara",
    });
  });

  it("allows omitting the slug", () => {
    expect(toggleFavoriteInput.parse({ recipeId: "abc123" })).toMatchObject({
      recipeId: "abc123",
    });
  });

  it("rejects an empty recipe id", () => {
    expect(() => toggleFavoriteInput.parse({ recipeId: " " })).toThrow();
  });
});

describe("collectionRecipeInput", () => {
  it("requires both ids", () => {
    expect(
      collectionRecipeInput.parse({
        collectionId: "col1",
        recipeId: "rec1",
      }),
    ).toMatchObject({ collectionId: "col1", recipeId: "rec1" });
    expect(() =>
      collectionRecipeInput.parse({ collectionId: "col1", recipeId: "" }),
    ).toThrow();
  });
});
