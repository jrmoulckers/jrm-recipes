import { describe, expect, it } from "vitest";

import {
  parseDurationToMinutes,
  parseIngredientLine,
  parseIsoDuration,
  parseRecipeFromHtml,
  parseYield,
} from "./import";

describe("parseIsoDuration", () => {
  it("parses hours and minutes", () => {
    expect(parseIsoDuration("PT1H30M")).toBe(90);
    expect(parseIsoDuration("PT45M")).toBe(45);
    expect(parseIsoDuration("PT2H")).toBe(120);
  });
  it("counts days and weeks", () => {
    expect(parseIsoDuration("P1DT2H")).toBe(24 * 60 + 120);
  });
  it("rejects nonsense", () => {
    expect(parseIsoDuration("banana")).toBeUndefined();
    expect(parseIsoDuration("PT0M")).toBeUndefined();
  });
});

describe("parseDurationToMinutes", () => {
  it("handles ISO, text, arrays and numbers", () => {
    expect(parseDurationToMinutes("PT20M")).toBe(20);
    expect(parseDurationToMinutes("1 hour 15 minutes")).toBe(75);
    expect(parseDurationToMinutes("30 mins")).toBe(30);
    expect(parseDurationToMinutes(["", "PT10M"])).toBe(10);
    expect(parseDurationToMinutes(25)).toBe(25);
    expect(parseDurationToMinutes("")).toBeUndefined();
  });
});

describe("parseYield", () => {
  it("splits count and noun", () => {
    expect(parseYield("4 servings")).toEqual({ servings: "4", noun: "servings" });
    expect(parseYield("Serves 6")).toEqual({ servings: "6", noun: "" });
    expect(parseYield(["8 cookies"])).toEqual({ servings: "8", noun: "cookies" });
    expect(parseYield(12)).toEqual({ servings: "12", noun: "" });
  });
});

describe("parseIngredientLine", () => {
  it("extracts quantity, unit and item", () => {
    expect(parseIngredientLine("2 cups all-purpose flour")).toMatchObject({
      quantity: "2",
      unit: "cup",
      item: "all-purpose flour",
      optional: false,
    });
  });
  it("handles fractions and mixed numbers", () => {
    expect(parseIngredientLine("1/2 tsp salt")).toMatchObject({
      quantity: "0.5",
      unit: "tsp",
      item: "salt",
    });
    expect(parseIngredientLine("1 1/2 tablespoons olive oil")).toMatchObject({
      quantity: "1.5",
      unit: "tbsp",
      item: "olive oil",
    });
  });
  it("handles unicode vulgar fractions", () => {
    expect(parseIngredientLine("½ cup sugar")).toMatchObject({
      quantity: "0.5",
      unit: "cup",
      item: "sugar",
    });
  });
  it("captures parenthetical notes and optional flag", () => {
    const r = parseIngredientLine("3 large eggs (room temperature), optional");
    expect(r.quantity).toBe("3");
    expect(r.item).toBe("large eggs");
    expect(r.note).toBe("room temperature");
    expect(r.optional).toBe(true);
  });
  it("keeps unit-less lines intact", () => {
    expect(parseIngredientLine("Salt and pepper to taste")).toMatchObject({
      quantity: "",
      unit: "",
      item: "Salt and pepper to taste",
    });
  });
});

const SAMPLE_HTML = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "ignore me" },
    {
      "@type": ["Recipe"],
      "name": "Grandma&#39;s Marinara",
      "description": "A slow-simmered <b>Sunday</b> sauce.",
      "image": ["https://cdn.example.com/marinara.jpg"],
      "author": { "@type": "Person", "name": "Nonna" },
      "recipeYield": "6 servings",
      "prepTime": "PT15M",
      "cookTime": "PT1H30M",
      "recipeCuisine": "Italian",
      "keywords": "sauce, italian, sauce",
      "recipeIngredient": [
        "2 cups crushed tomatoes",
        "1/4 cup olive oil",
        "3 cloves garlic (minced)"
      ],
      "recipeInstructions": [
        { "@type": "HowToStep", "text": "Warm the oil.", "image": "https://cdn.example.com/s1.jpg" },
        { "@type": "HowToSection", "name": "Simmer", "itemListElement": [
          { "@type": "HowToStep", "text": "Add tomatoes." },
          { "@type": "HowToStep", "text": "Simmer 90 minutes." }
        ]}
      ]
    }
  ]
}
</script></head><body></body></html>
`;

describe("parseRecipeFromHtml", () => {
  const recipe = parseRecipeFromHtml(SAMPLE_HTML, "https://example.com/marinara");

  it("finds the Recipe node inside @graph", () => {
    expect(recipe).not.toBeNull();
  });
  it("maps scalar fields and decodes entities/HTML", () => {
    expect(recipe?.title).toBe("Grandma's Marinara");
    expect(recipe?.description).toBe("A slow-simmered Sunday sauce.");
    expect(recipe?.coverImageUrl).toBe("https://cdn.example.com/marinara.jpg");
    expect(recipe?.sourceName).toBe("Nonna");
    expect(recipe?.servings).toBe("6");
    expect(recipe?.prepMinutes).toBe("15");
    expect(recipe?.cookMinutes).toBe("90");
    expect(recipe?.cuisine).toBe("Italian");
  });
  it("dedupes keywords into tags", () => {
    expect(recipe?.tags).toBe("sauce, italian");
  });
  it("parses ingredients with quantities and notes", () => {
    expect(recipe?.ingredients).toHaveLength(3);
    expect(recipe?.ingredients[1]).toMatchObject({
      quantity: "0.25",
      unit: "cup",
      item: "olive oil",
    });
    expect(recipe?.ingredients[2]).toMatchObject({
      unit: "cloves",
      item: "garlic",
      note: "minced",
    });
  });
  it("flattens HowToSection steps and keeps step images", () => {
    expect(recipe?.steps).toHaveLength(3);
    expect(recipe?.steps[0]).toMatchObject({
      instruction: "Warm the oil.",
      imageUrl: "https://cdn.example.com/s1.jpg",
    });
    expect(recipe?.steps[2]?.instruction).toBe("Simmer 90 minutes.");
  });
  it("returns null when there is no recipe", () => {
    expect(parseRecipeFromHtml("<html></html>", "https://x.com")).toBeNull();
  });
});
