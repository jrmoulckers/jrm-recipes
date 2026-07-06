import { describe, expect, it } from "vitest";

import {
  buildRecipeJsonLd,
  buildRecipeMetadata,
  minutesToIsoDuration,
  serializeJsonLd,
  type SeoRecipe,
} from "./recipe-seo";
import { brand } from "~/config/brand";

function makeRecipe(overrides: Partial<SeoRecipe> = {}): SeoRecipe {
  return {
    slug: "aunt-mays-peach-cobbler",
    title: "Aunt May's Peach Cobbler",
    description: "Bubbling fruit under a craggy biscuit top.",
    coverImageUrl: "https://cdn.example.com/cobbler.jpg",
    visibility: "public",
    servings: 8,
    servingsNoun: "squares",
    prepMinutes: 20,
    cookMinutes: 45,
    totalMinutes: null,
    author: { name: "Aunt May" },
    ingredients: [
      {
        quantity: 6,
        quantityMax: null,
        unit: "cups",
        item: "peaches",
        note: "peeled",
      },
      {
        quantity: 0.5,
        quantityMax: null,
        unit: "cup",
        item: "brown sugar",
        note: null,
      },
      { quantity: null, quantityMax: null, unit: null, item: "salt", note: null },
    ],
    steps: [
      {
        section: "Filling",
        instruction: "Toss the peaches with sugar.",
      },
      { section: null, instruction: "Bake until the fruit bubbles." },
    ],
    ratings: [{ value: 5 }, { value: 4 }, { value: 5 }],
    publishedAt: new Date("2024-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("minutesToIsoDuration", () => {
  it("formats hours and minutes", () => {
    expect(minutesToIsoDuration(90)).toBe("PT1H30M");
    expect(minutesToIsoDuration(60)).toBe("PT1H");
    expect(minutesToIsoDuration(45)).toBe("PT45M");
  });

  it("rounds fractional minutes", () => {
    expect(minutesToIsoDuration(30.4)).toBe("PT30M");
  });

  it("returns undefined for missing or non-positive values", () => {
    expect(minutesToIsoDuration(null)).toBeUndefined();
    expect(minutesToIsoDuration(undefined)).toBeUndefined();
    expect(minutesToIsoDuration(0)).toBeUndefined();
    expect(minutesToIsoDuration(-5)).toBeUndefined();
  });
});

describe("buildRecipeJsonLd", () => {
  it("produces a schema.org Recipe with core fields", () => {
    const jsonLd = buildRecipeJsonLd(makeRecipe());

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Recipe");
    expect(jsonLd.name).toBe("Aunt May's Peach Cobbler");
    expect(jsonLd.description).toBe(
      "Bubbling fruit under a craggy biscuit top.",
    );
    expect(jsonLd.image).toEqual(["https://cdn.example.com/cobbler.jpg"]);
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Aunt May" });
    expect(jsonLd.datePublished).toBe("2024-06-01T12:00:00.000Z");
    expect(jsonLd.url).toContain("/recipes/aunt-mays-peach-cobbler");
  });

  it("renders ingredient lines and step instructions", () => {
    const jsonLd = buildRecipeJsonLd(makeRecipe());

    expect(jsonLd.recipeIngredient).toEqual([
      "6 cups peaches, peeled",
      "½ cups brown sugar",
      "salt",
    ]);
    expect(jsonLd.recipeInstructions).toEqual([
      {
        "@type": "HowToStep",
        text: "Toss the peaches with sugar.",
        name: "Filling",
      },
      { "@type": "HowToStep", text: "Bake until the fruit bubbles." },
    ]);
  });

  it("derives ISO durations and yield", () => {
    const jsonLd = buildRecipeJsonLd(makeRecipe());

    expect(jsonLd.prepTime).toBe("PT20M");
    expect(jsonLd.cookTime).toBe("PT45M");
    // total falls back to prep + cook when totalMinutes is null.
    expect(jsonLd.totalTime).toBe("PT1H5M");
    expect(jsonLd.recipeYield).toBe("8 squares");
  });

  it("includes aggregateRating only when ratings exist", () => {
    const rated = buildRecipeJsonLd(makeRecipe());
    expect(rated.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.7,
      ratingCount: 3,
      bestRating: 5,
      worstRating: 1,
    });

    const unrated = buildRecipeJsonLd(makeRecipe({ ratings: [] }));
    expect(unrated.aggregateRating).toBeUndefined();
  });

  it("omits optional fields when data is missing", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({
        description: null,
        coverImageUrl: null,
        author: null,
        publishedAt: null,
        prepMinutes: null,
        cookMinutes: null,
        totalMinutes: null,
        servings: null,
        ingredients: [],
        steps: [],
        ratings: [],
      }),
    );

    expect(jsonLd.description).toBeUndefined();
    expect(jsonLd.image).toBeUndefined();
    expect(jsonLd.author).toBeUndefined();
    expect(jsonLd.datePublished).toBeUndefined();
    expect(jsonLd.prepTime).toBeUndefined();
    expect(jsonLd.totalTime).toBeUndefined();
    expect(jsonLd.recipeYield).toBeUndefined();
    expect(jsonLd.recipeIngredient).toBeUndefined();
    expect(jsonLd.recipeInstructions).toBeUndefined();
    // Required identity fields are always present.
    expect(jsonLd.name).toBe("Aunt May's Peach Cobbler");
  });
});

describe("serializeJsonLd", () => {
  it("escapes angle brackets to prevent script breakout", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
  });

  it("round-trips to the original object once unescaped", () => {
    const data = { a: 1, b: "two", c: [3, 4] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});

describe("buildRecipeMetadata", () => {
  it("emits rich, indexable metadata for public recipes", () => {
    const meta = buildRecipeMetadata(makeRecipe());

    expect(meta.title).toBe("Aunt May's Peach Cobbler");
    expect(meta.description).toBe(
      "Bubbling fruit under a craggy biscuit top.",
    );
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toContain(
      "/recipes/aunt-mays-peach-cobbler",
    );
    expect(meta.openGraph).toMatchObject({
      type: "article",
      title: "Aunt May's Peach Cobbler",
      siteName: brand.name,
      images: ["https://cdn.example.com/cobbler.jpg"],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://cdn.example.com/cobbler.jpg"],
    });
  });

  it("omits OG images when no cover image is present", () => {
    const meta = buildRecipeMetadata(makeRecipe({ coverImageUrl: null }));
    const og = meta.openGraph as { images?: unknown } | undefined;
    expect(og?.images).toBeUndefined();
  });

  it.each(["private", "group", "unlisted"] as const)(
    "returns generic no-index metadata for %s recipes",
    (visibility) => {
      const meta = buildRecipeMetadata(makeRecipe({ visibility }));
      expect(meta.title).toBe("Recipe");
      expect(meta.description).toBe(brand.description);
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.openGraph).toBeUndefined();
      expect(meta.alternates).toBeUndefined();
    },
  );

  it("returns generic no-index metadata when the recipe is null", () => {
    const meta = buildRecipeMetadata(null);
    expect(meta.title).toBe("Recipe");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
