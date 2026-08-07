import { describe, expect, it } from "vitest";

import {
  RECIPE_FALLBACK_IMAGES,
  recipeFallbackImage,
} from "./recipe-image-fallback";

describe("recipeFallbackImage", () => {
  it("prioritizes explicit meal tags over title and cuisine signals", () => {
    expect(
      recipeFallbackImage("semantic-priority", {
        tags: ["Dinner"],
        title: "Blueberry Buttermilk Pancakes",
        cuisine: "Italian",
      }),
    ).toBe("/img/recipe-fallbacks/plated-supper.webp");
  });

  it("recognizes breakfast dishes from sparse recipe titles", () => {
    expect(
      recipeFallbackImage("blueberry-pancakes", {
        title: "Blueberry Buttermilk Pancakes",
      }),
    ).toBe("/img/recipe-fallbacks/kitchen-prep.webp");
  });

  it("uses cuisine when meal and title signals are absent", () => {
    expect(
      recipeFallbackImage("family-special", {
        title: "Family Special",
        cuisine: "Northern Italian",
      }),
    ).toBe("/img/recipe-fallbacks/pasta-table.webp");
  });

  it("keeps the hash fallback stable when context has no known signal", () => {
    const key = "grandmas-secret";
    expect(
      recipeFallbackImage(key, {
        title: "Grandma's Secret",
        cuisine: "Family Style",
        tags: ["Heirloom"],
      }),
    ).toBe(recipeFallbackImage(key));
  });

  it("returns the same bundled image for the same recipe key", () => {
    const first = recipeFallbackImage("recipe-family-lasagna");

    expect(recipeFallbackImage("recipe-family-lasagna")).toBe(first);
    expect(RECIPE_FALLBACK_IMAGES).toContain(first);
  });

  it("distributes recipe keys across the full fallback set", () => {
    const selected = new Set(
      Array.from({ length: 24 }, (_, index) =>
        recipeFallbackImage(`recipe-${index}`),
      ),
    );

    expect(selected.size).toBe(RECIPE_FALLBACK_IMAGES.length);
  });
});
