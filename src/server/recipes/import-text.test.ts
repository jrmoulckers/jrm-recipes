import { describe, expect, it } from "vitest";

import { parseRecipeText } from "./import-text";

describe("parseRecipeText", () => {
  it("parses a headed recipe into title, ingredients and steps", () => {
    const text = [
      "Grandma's Marinara",
      "",
      "Ingredients",
      "2 cups crushed tomatoes",
      "1 clove garlic, minced",
      "Salt to taste",
      "",
      "Instructions",
      "1. Warm the oil.",
      "2. Add garlic and cook one minute.",
      "3. Pour in tomatoes and simmer 20 minutes.",
    ].join("\n");

    const result = parseRecipeText(text);
    expect(result.title).toBe("Grandma's Marinara");
    expect(result.ingredients).toHaveLength(3);
    expect(result.ingredients[0]).toMatchObject({
      quantity: "2",
      unit: "cup",
      item: "crushed tomatoes",
    });
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]?.instruction).toBe("Warm the oil.");
    expect(result.steps[2]?.instruction).toContain("simmer 20 minutes");
  });

  it("handles bulleted ingredients and numbered steps without headings", () => {
    const text = [
      "Quick Pancakes",
      "- 1 cup flour",
      "- 1 egg",
      "- 1 cup milk",
      "1. Whisk everything together into a smooth batter.",
      "2. Cook on a hot griddle until golden.",
    ].join("\n");

    const result = parseRecipeText(text);
    expect(result.title).toBe("Quick Pancakes");
    expect(result.ingredients).toHaveLength(3);
    expect(result.ingredients[1]?.item).toBe("egg");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.instruction).toContain("Whisk everything");
  });

  it("keeps unparseable ingredient lines as item text", () => {
    const text = [
      "Ingredients",
      "a handful of fresh basil",
      "Steps",
      "Tear the basil over the top.",
    ].join("\n");

    const result = parseRecipeText(text);
    const items = result.ingredients.map((i) => i.item);
    expect(items.some((i) => i.includes("basil"))).toBe(true);
    expect(result.steps).toHaveLength(1);
  });

  it("tolerates messy spacing and section headings inside blocks", () => {
    const text = [
      "  Layered Dip  ",
      "",
      "INGREDIENTS:",
      "   2 cups beans   ",
      "",
      "  1 cup cheese",
      "",
      "DIRECTIONS:",
      "   Spread the beans.   ",
      "   Top with cheese.",
    ].join("\n");

    const result = parseRecipeText(text);
    expect(result.title).toBe("Layered Dip");
    expect(result.ingredients).toHaveLength(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.instruction).toBe("Spread the beans.");
  });

  it("never throws on empty or junk input", () => {
    expect(parseRecipeText("").title).toBe("");
    expect(parseRecipeText("").ingredients).toHaveLength(0);
    expect(() => parseRecipeText("\n\n   \n")).not.toThrow();
    const single = parseRecipeText("Just a title line");
    expect(single.title).toBe("Just a title line");
  });
});
