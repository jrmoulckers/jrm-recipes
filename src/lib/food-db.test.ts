import { describe, expect, it } from "vitest";

import {
  densityForFood,
  FOOD_CATEGORIES,
  FOOD_CATEGORY_LABELS,
  FOOD_ITEMS,
  foodCategoryForItem,
  isFoodCategory,
  matchFood,
  normalizeFoodText,
  type FoodCategory,
} from "./food-db";

describe("normalizeFoodText", () => {
  it("lowercases, strips accents, parentheticals, and post-comma prep notes", () => {
    expect(normalizeFoodText("2 cups Jalapeño (seeded), finely diced")).toBe(
      "2 cups jalapeno",
    );
    expect(normalizeFoodText("All-Purpose Flour")).toBe("all purpose flour");
    expect(normalizeFoodText("  Extra  Virgin   Olive Oil ")).toBe(
      "extra virgin olive oil",
    );
  });

  it("returns empty string for nullish/blank input", () => {
    expect(normalizeFoodText(null)).toBe("");
    expect(normalizeFoodText(undefined)).toBe("");
    expect(normalizeFoodText("   ")).toBe("");
  });
});

describe("matchFood — basic resolution", () => {
  it("matches common ingredients to their food record", () => {
    expect(matchFood("water")?.name).toBe("Water");
    expect(matchFood("2 large eggs")?.category).toBe("egg");
    expect(matchFood("1 lb ground beef")?.category).toBe("meat");
    expect(matchFood("fresh basil leaves")?.category).toBe("herb");
    expect(matchFood("a pinch of salt")?.category).toBe("spice");
  });

  it("ignores quantities, units, and prep notes around the ingredient", () => {
    expect(matchFood("1 cup whole milk, cold")?.category).toBe("dairy");
    expect(matchFood("3 tbsp olive oil")?.name).toBe("Oil");
    expect(matchFood("500 g all-purpose flour, sifted")?.name).toBe("Flour");
  });

  it("returns null when nothing sensible matches", () => {
    expect(matchFood("")).toBeNull();
    expect(matchFood(null)).toBeNull();
    expect(matchFood("xyzzy nonexistent thing")).toBeNull();
  });
});

describe("matchFood — longest-match-wins", () => {
  it("prefers the more specific multi-word phrase", () => {
    expect(matchFood("1 cup brown sugar")?.name).toBe("Brown sugar");
    expect(matchFood("1 cup sugar")?.name).toBe("Sugar");
    expect(matchFood("2 sweet potatoes")?.name).toBe("Sweet potato");
    expect(matchFood("2 potatoes")?.name).toBe("Potato");
    expect(matchFood("powdered sugar")?.name).toBe("Powdered sugar");
  });

  it("distinguishes whole ginger from ground ginger", () => {
    expect(matchFood("1 tbsp grated fresh ginger")?.category).toBe(
      "produce-whole",
    );
    expect(matchFood("1 tsp ground ginger")?.category).toBe("spice");
  });
});

describe("densityForFood", () => {
  it("returns the density for foods that carry one", () => {
    expect(densityForFood("water")).toBe(1.0);
    expect(densityForFood("1 cup all purpose flour")).toBeCloseTo(0.53);
    expect(densityForFood("2 tbsp honey")).toBeCloseTo(1.42);
  });

  it("returns null for foods with no known density and for no match", () => {
    expect(densityForFood("2 large eggs")).toBeNull(); // egg has no density
    expect(densityForFood("nonexistent")).toBeNull();
  });
});

describe("foodCategoryForItem", () => {
  it("resolves a category or null", () => {
    expect(foodCategoryForItem("spinach")).toBe("produce-leafy");
    expect(foodCategoryForItem("shrimp")).toBe("seafood");
    expect(foodCategoryForItem("mystery")).toBeNull();
  });
});

describe("taxonomy integrity", () => {
  it("every FoodItem uses a canonical category", () => {
    for (const food of FOOD_ITEMS) {
      expect(FOOD_CATEGORIES).toContain(food.category);
    }
  });

  it("every category has a human label", () => {
    for (const category of FOOD_CATEGORIES) {
      expect(FOOD_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("has at least one seeded food per category", () => {
    const covered = new Set<FoodCategory>(FOOD_ITEMS.map((f) => f.category));
    // `other` is a runtime fallback, not a seeded category.
    for (const category of FOOD_CATEGORIES) {
      if (category === "other") continue;
      expect(covered.has(category)).toBe(true);
    }
  });

  it("has no duplicate normalized aliases across items", () => {
    const seen = new Map<string, string>();
    for (const food of FOOD_ITEMS) {
      for (const alias of food.aliases) {
        const key = normalizeFoodText(alias);
        expect(seen.has(key), `duplicate alias "${key}" (${food.name} vs ${seen.get(key)})`).toBe(false);
        seen.set(key, food.name);
      }
    }
  });

  it("isFoodCategory narrows correctly", () => {
    expect(isFoodCategory("spice")).toBe(true);
    expect(isFoodCategory("not-a-category")).toBe(false);
  });
});
