import { describe, expect, it } from "vitest";

import {
  RECIPE_FALLBACK_IMAGES,
  recipeFallbackImage,
} from "./recipe-image-fallback";

describe("recipeFallbackImage", () => {
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
