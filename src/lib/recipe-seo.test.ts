import { describe, expect, it } from "vitest";

import {
  buildRecipeJsonLd,
  minutesToIsoDuration,
  serializeJsonLd,
  type SeoRecipe,
} from "./recipe-seo";

function makeRecipe(overrides: Partial<SeoRecipe> = {}): SeoRecipe {
  return {
    slug: "aunt-mays-peach-cobbler",
    title: "Aunt May's Peach Cobbler",
    description: "Bubbling fruit under a craggy biscuit top.",
    coverImageUrl: "https://cdn.example.com/cobbler.jpg",
    servings: 8,
    servingsNoun: "squares",
    prepMinutes: 20,
    cookMinutes: 45,
    totalMinutes: null,
    authorId: "author_1",
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
    ratings: [
      { value: 5, userId: "fan_1" },
      { value: 4, userId: "fan_2" },
      { value: 5, userId: "fan_3" },
    ],
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

  it("includes step images after the deduped cover image", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({
        coverImageUrl: "https://cdn.example.com/cobbler.jpg",
        steps: [
          {
            section: "Filling",
            instruction: "Toss the peaches with sugar.",
            imageUrl: "https://cdn.example.com/peaches.jpg",
          },
          {
            section: null,
            instruction: "Bake until the fruit bubbles.",
            imageUrl: "https://cdn.example.com/cobbler.jpg",
          },
          {
            section: null,
            instruction: "Cool before serving.",
            imageUrl: null,
          },
          {
            section: null,
            instruction: "Spoon into bowls.",
            imageUrl: "https://cdn.example.com/served.jpg",
          },
        ],
      }),
    );

    expect(jsonLd.image).toEqual([
      "https://cdn.example.com/cobbler.jpg",
      "https://cdn.example.com/peaches.jpg",
      "https://cdn.example.com/served.jpg",
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
      reviewCount: 3,
      bestRating: 5,
      worstRating: 1,
    });

    const unrated = buildRecipeJsonLd(makeRecipe({ ratings: [] }));
    expect(unrated.aggregateRating).toBeUndefined();
  });

  it("excludes the owner's own rating from aggregateRating", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({
        authorId: "author_1",
        ratings: [
          // The author can't rate their own recipe; a stray self-rating here
          // must not drag the published aggregate down.
          { value: 1, userId: "author_1" },
          { value: 5, userId: "fan_1" },
          { value: 4, userId: "fan_2" },
        ],
      }),
    );

    expect(jsonLd.aggregateRating).toMatchObject({
      ratingValue: 4.5,
      ratingCount: 2,
    });
  });

  it("omits aggregateRating when only the owner has rated", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({
        authorId: "author_1",
        ratings: [{ value: 5, userId: "author_1" }],
      }),
    );

    expect(jsonLd.aggregateRating).toBeUndefined();
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
    expect(jsonLd.nutrition).toBeUndefined();
    // Required identity fields are always present.
    expect(jsonLd.name).toBe("Aunt May's Peach Cobbler");
  });
});

describe("buildRecipeJsonLd nutrition", () => {
  it("emits a NutritionInformation block with formatted units", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({
        calories: 320,
        proteinGrams: 8,
        carbsGrams: 45,
        fatGrams: 12,
        saturatedFatGrams: 5,
        sodiumMg: 400,
        sugarGrams: 20,
        fiberGrams: 3,
      }),
    );

    expect(jsonLd.nutrition).toEqual({
      "@type": "NutritionInformation",
      servingSize: "1 serving",
      calories: "320 calories",
      proteinContent: "8 g",
      carbohydrateContent: "45 g",
      fatContent: "12 g",
      saturatedFatContent: "5 g",
      sugarContent: "20 g",
      fiberContent: "3 g",
      sodiumContent: "400 mg",
    });
  });

  it("includes only the populated nutrient properties", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({ calories: 210, proteinGrams: 6.5 }),
    );

    expect(jsonLd.nutrition).toEqual({
      "@type": "NutritionInformation",
      servingSize: "1 serving",
      calories: "210 calories",
      proteinContent: "6.5 g",
    });
  });

  it("rounds energy and trims macronutrient decimals", () => {
    const jsonLd = buildRecipeJsonLd(
      makeRecipe({ calories: 199.6, fatGrams: 12.04, sodiumMg: 305.5 }),
    );

    expect(jsonLd.nutrition).toMatchObject({
      calories: "200 calories",
      fatContent: "12 g",
      sodiumContent: "306 mg",
    });
  });

  it("omits nutrition entirely when no values are present", () => {
    const jsonLd = buildRecipeJsonLd(makeRecipe());
    expect(jsonLd.nutrition).toBeUndefined();

    const zeroedButNull = buildRecipeJsonLd(
      makeRecipe({ calories: null, proteinGrams: null }),
    );
    expect(zeroedButNull.nutrition).toBeUndefined();
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
