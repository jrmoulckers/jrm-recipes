import { describe, expect, it } from "vitest";

import {
  OEMBED_DEFAULT_HEIGHT,
  OEMBED_DEFAULT_WIDTH,
  OEMBED_MIN_HEIGHT,
  OEMBED_MIN_WIDTH,
  buildRecipeOembed,
  clampDimension,
  recipeSlugFromUrl,
  type OembedRecipe,
} from "./oembed";

const BASE = "https://heirloom.example.com/";

function makeRecipe(overrides: Partial<OembedRecipe> = {}): OembedRecipe {
  return {
    slug: "grandmas-apple-pie",
    title: "Grandma's Apple Pie",
    coverImageUrl: "https://img.example.com/pie.jpg",
    author: { name: "Ada Lovelace", handle: "ada" },
    ...overrides,
  };
}

describe("recipeSlugFromUrl", () => {
  it("extracts the slug from a same-origin recipe URL", () => {
    expect(
      recipeSlugFromUrl("https://heirloom.example.com/recipes/apple-pie", BASE),
    ).toBe("apple-pie");
  });

  it("tolerates a trailing slash", () => {
    expect(
      recipeSlugFromUrl("https://heirloom.example.com/recipes/apple-pie/", BASE),
    ).toBe("apple-pie");
  });

  it("rejects foreign origins (SSRF/abuse guard)", () => {
    expect(
      recipeSlugFromUrl("https://evil.example.com/recipes/apple-pie", BASE),
    ).toBeNull();
  });

  it("rejects non-recipe paths", () => {
    expect(
      recipeSlugFromUrl("https://heirloom.example.com/cooks/ada", BASE),
    ).toBeNull();
    expect(
      recipeSlugFromUrl("https://heirloom.example.com/recipes", BASE),
    ).toBeNull();
    expect(
      recipeSlugFromUrl(
        "https://heirloom.example.com/recipes/apple-pie/edit",
        BASE,
      ),
    ).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(recipeSlugFromUrl("not a url", BASE)).toBeNull();
    expect(recipeSlugFromUrl("", BASE)).toBeNull();
  });
});

describe("clampDimension", () => {
  it("falls back when unset or non-numeric", () => {
    expect(clampDimension(null, 500, 280)).toBe(500);
    expect(clampDimension(Number.NaN, 500, 280)).toBe(500);
  });

  it("caps at the fallback and floors at the minimum", () => {
    expect(clampDimension(9000, 500, 280)).toBe(500);
    expect(clampDimension(10, 500, 280)).toBe(280);
    expect(clampDimension(400, 500, 280)).toBe(400);
  });
});

describe("buildRecipeOembed", () => {
  it("builds a valid rich payload with an iframe and attribution", () => {
    const payload = buildRecipeOembed(makeRecipe(), {});
    expect(payload.version).toBe("1.0");
    expect(payload.type).toBe("rich");
    expect(payload.title).toBe("Grandma's Apple Pie");
    expect(payload.author_name).toBe("Ada Lovelace");
    expect(payload.author_url).toContain("/cooks/ada");
    expect(payload.thumbnail_url).toBe("https://img.example.com/pie.jpg");
    expect(payload.width).toBe(OEMBED_DEFAULT_WIDTH);
    expect(payload.height).toBe(OEMBED_DEFAULT_HEIGHT);
    expect(payload.html).toContain("<iframe");
    expect(payload.html).toContain("/embed/recipes/grandmas-apple-pie");
    expect(payload.html).toContain(`width="${OEMBED_DEFAULT_WIDTH}"`);
  });

  it("honors maxwidth/maxheight within bounds", () => {
    const payload = buildRecipeOembed(makeRecipe(), {
      maxwidth: 360,
      maxheight: 5,
    });
    expect(payload.width).toBe(360);
    expect(payload.height).toBe(OEMBED_MIN_HEIGHT);
    expect(payload.html).toContain('width="360"');
  });

  it("omits optional fields when absent", () => {
    const payload = buildRecipeOembed(
      makeRecipe({ coverImageUrl: null, author: null }),
    );
    expect(payload.thumbnail_url).toBeUndefined();
    expect(payload.author_name).toBeUndefined();
    expect(payload.author_url).toBeUndefined();
  });

  it("escapes the title inside the iframe title attribute", () => {
    const payload = buildRecipeOembed(
      makeRecipe({ title: 'Ann & "Bob" <pie>' }),
    );
    expect(payload.html).toContain("Ann &amp; &quot;Bob&quot; &lt;pie&gt;");
    expect(payload.html).not.toContain('"Bob"');
  });

  it("keeps the minimum width floor for tiny requests", () => {
    const payload = buildRecipeOembed(makeRecipe(), { maxwidth: 1 });
    expect(payload.width).toBe(OEMBED_MIN_WIDTH);
  });
});
