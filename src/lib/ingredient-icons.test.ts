import { describe, expect, it } from "vitest";

import { FALLBACK_INGREDIENT_ICON, ingredientIcon } from "./ingredient-icons";

describe("ingredientIcon (issue #440)", () => {
  it("matches common ingredients", () => {
    expect(ingredientIcon("egg")).toBe("🥚");
    expect(ingredientIcon("unsalted butter")).toBe("🧈");
    expect(ingredientIcon("all-purpose flour")).toBe("🌾");
    expect(ingredientIcon("whole milk")).toBe("🥛");
    expect(ingredientIcon("granulated sugar")).toBe("🍬");
    expect(ingredientIcon("carrot")).toBe("🥕");
    expect(ingredientIcon("yellow onion")).toBe("🧅");
    expect(ingredientIcon("boneless chicken")).toBe("🍗");
    expect(ingredientIcon("water")).toBe("💧");
    expect(ingredientIcon("salt")).toBe("🧂");
  });

  it("is case- and plural-tolerant", () => {
    expect(ingredientIcon("Eggs")).toBe("🥚");
    expect(ingredientIcon("EGG")).toBe("🥚");
    expect(ingredientIcon("Carrots")).toBe("🥕");
    expect(ingredientIcon("tomatoes")).toBe("🍅");
  });

  it("prefers the most specific match", () => {
    // "buttermilk" is a milk product, not butter.
    expect(ingredientIcon("buttermilk")).toBe("🥛");
    expect(ingredientIcon("peanut butter")).toBe("🥜");
    expect(ingredientIcon("sweet potato")).toBe("🍠");
  });

  it("matches multi-word and accented keywords", () => {
    expect(ingredientIcon("extra-virgin olive oil")).toBe("🫒");
    expect(ingredientIcon("diced jalapeño")).toBe("🌶️");
  });

  it("falls back to a friendly generic icon", () => {
    expect(ingredientIcon("quinoa")).toBe(FALLBACK_INGREDIENT_ICON);
    expect(ingredientIcon("tempeh")).toBe(FALLBACK_INGREDIENT_ICON);
  });

  it("never throws on odd input", () => {
    expect(ingredientIcon("")).toBe(FALLBACK_INGREDIENT_ICON);
    expect(ingredientIcon(null)).toBe(FALLBACK_INGREDIENT_ICON);
    expect(ingredientIcon(undefined)).toBe(FALLBACK_INGREDIENT_ICON);
    expect(ingredientIcon("123 !!!")).toBe(FALLBACK_INGREDIENT_ICON);
  });
});
