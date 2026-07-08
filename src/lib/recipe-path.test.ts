import { describe, expect, it } from "vitest";

import { recipeDetailPath } from "./recipe-path";

describe("recipeDetailPath", () => {
  it("uses the slug-based detail route when a recipe has a slug", () => {
    // The `/recipes/[id]` loader accepts id or slug, but users view the slug —
    // so mutations must revalidate this path, not the id one.
    expect(recipeDetailPath({ id: "rec_123", slug: "apple-pie" })).toBe(
      "/recipes/apple-pie",
    );
  });

  it("falls back to the id when a recipe has no slug", () => {
    expect(recipeDetailPath({ id: "rec_123", slug: null })).toBe(
      "/recipes/rec_123",
    );
  });
});
