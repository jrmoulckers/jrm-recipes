import { describe, expect, it } from "vitest";

import {
  aggregateShoppingList,
  categorize,
  describeQuantity,
  groupByCategory,
  mergeShoppingItems,
  normalizeItemName,
  scaleFactor,
  toShoppingItems,
  type ShoppingItemInput,
} from "./shopping-list";

function byItem<T extends { item: string }>(items: T[], name: string) {
  return items.filter((i) => i.item.toLowerCase() === name.toLowerCase());
}

describe("scaleFactor", () => {
  it("scales by the ratio of desired to base servings", () => {
    expect(scaleFactor(4, 8)).toBe(2);
    expect(scaleFactor(4, 2)).toBe(0.5);
    expect(scaleFactor(3, 3)).toBe(1);
  });

  it("falls back to 1 when servings are missing or zero", () => {
    expect(scaleFactor(null, 8)).toBe(1);
    expect(scaleFactor(4, null)).toBe(1);
    expect(scaleFactor(0, 8)).toBe(1);
    expect(scaleFactor(4, 0)).toBe(1);
    expect(scaleFactor(undefined, undefined)).toBe(1);
  });

  it("defaults desired to base when only base is given", () => {
    expect(scaleFactor(4, undefined)).toBe(1);
  });
});

describe("normalizeItemName", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeItemName("  Olive   Oil ")).toBe("olive oil");
    expect(normalizeItemName("EGGS")).toBe("eggs");
  });
});

describe("categorize", () => {
  it.each([
    ["Flour", "Pantry"],
    ["granulated sugar", "Pantry"],
    ["Chicken thighs", "Meat & Seafood"],
    ["Whole milk", "Dairy & Eggs"],
    ["Eggs", "Dairy & Eggs"],
    ["Yellow onion", "Produce"],
    ["Fresh basil", "Spices & Seasonings"],
    ["Salt", "Spices & Seasonings"],
    ["Sourdough bread", "Bakery"],
    ["Frozen peas", "Frozen"],
    ["Orange juice", "Beverages"],
    ["Unobtainium", "Other"],
  ])("puts %s in %s", (item, category) => {
    expect(categorize(item)).toBe(category);
  });

  it("does not match keywords inside longer words", () => {
    // "corn" (Produce) must not swallow "cornstarch" (Pantry).
    expect(categorize("cornstarch")).toBe("Pantry");
  });
});

describe("mergeShoppingItems", () => {
  it("sums identical item + unit", () => {
    const [item] = mergeShoppingItems([
      { item: "Flour", quantity: 2, unit: "cup" },
      { item: "flour", quantity: 1, unit: "cup" },
    ]);
    expect(item).toMatchObject({ item: "Flour", quantity: 3, unit: "cup" });
    expect(describeQuantity(item!)).toBe("3 cups");
  });

  it("combines compatible units within a dimension", () => {
    // 3 tsp + 1 tbsp = 2 tbsp.
    const [item] = mergeShoppingItems([
      { item: "Olive oil", quantity: 3, unit: "tsp" },
      { item: "Olive oil", quantity: 1, unit: "tbsp" },
    ]);
    expect(describeQuantity(item!)).toBe("2 tbsp");
  });

  it("re-expresses metric amounts up the ladder", () => {
    const [item] = mergeShoppingItems([
      { item: "Milk", quantity: 500, unit: "ml" },
      { item: "Milk", quantity: 500, unit: "ml" },
    ]);
    expect(item).toMatchObject({ quantity: 1, unit: "l" });
  });

  it("keeps incompatible dimensions of the same item separate", () => {
    const items = mergeShoppingItems([
      { item: "Flour", quantity: 2, unit: "cup" },
      { item: "Flour", quantity: 100, unit: "g" },
    ]);
    expect(byItem(items, "Flour")).toHaveLength(2);
  });

  it("sums unitless (count) items", () => {
    const [item] = mergeShoppingItems([
      { item: "Eggs", quantity: 2 },
      { item: "eggs", quantity: 3 },
    ]);
    expect(item).toMatchObject({ quantity: 5, unit: null });
    expect(describeQuantity(item!)).toBe("5");
  });

  it("sums unknown units only when they match", () => {
    const same = mergeShoppingItems([
      { item: "Tomatoes", quantity: 1, unit: "can" },
      { item: "Tomatoes", quantity: 2, unit: "can" },
    ]);
    expect(same).toHaveLength(1);
    expect(describeQuantity(same[0]!)).toBe("3 can");

    const different = mergeShoppingItems([
      { item: "Rice", quantity: 1, unit: "cup" },
      { item: "Rice", quantity: 1, unit: "bag" },
    ]);
    expect(different).toHaveLength(2);
  });

  it("keeps unquantified items on the list", () => {
    const [item] = mergeShoppingItems([{ item: "Salt to taste" }]);
    expect(item).toMatchObject({ quantity: null, unit: null });
    expect(describeQuantity(item!)).toBe("");
  });

  it("accumulates quantity ranges", () => {
    // (1–2 tsp) + (1 tsp) => 2–3 tsp.
    const [item] = mergeShoppingItems([
      { item: "Chili flakes", quantity: 1, quantityMax: 2, unit: "tsp" },
      { item: "Chili flakes", quantity: 1, unit: "tsp" },
    ]);
    expect(item).toMatchObject({ quantity: 2, quantityMax: 3, unit: "tsp" });
    expect(describeQuantity(item!)).toBe("2–3 tsp");
  });

  it("is optional only when every contribution is optional", () => {
    const [allOptional] = mergeShoppingItems([
      { item: "Parsley", quantity: 1, unit: "tbsp", optional: true },
      { item: "Parsley", quantity: 1, unit: "tbsp", optional: true },
    ]);
    expect(allOptional?.optional).toBe(true);

    const [mixed] = mergeShoppingItems([
      { item: "Parsley", quantity: 1, unit: "tbsp", optional: true },
      { item: "Parsley", quantity: 1, unit: "tbsp", optional: false },
    ]);
    expect(mixed?.optional).toBe(false);
  });

  it("collects contributing recipe ids without duplicates", () => {
    const [item] = mergeShoppingItems([
      { item: "Butter", quantity: 1, unit: "tbsp", recipeId: "a" },
      { item: "Butter", quantity: 1, unit: "tbsp", recipeId: "b" },
      { item: "Butter", quantity: 1, unit: "tbsp", recipeId: "a" },
    ]);
    expect(item?.recipeIds).toEqual(["a", "b"]);
  });

  it("ignores blank item names", () => {
    expect(mergeShoppingItems([{ item: "   " }])).toHaveLength(0);
  });
});

describe("toShoppingItems", () => {
  it("scales each ingredient by the serving factor", () => {
    const items = toShoppingItems({
      recipeId: "r1",
      servings: 4,
      desiredServings: 8,
      ingredients: [
        { item: "Flour", quantity: 1, quantityMax: 2, unit: "cup" },
        { item: "Salt", unit: "pinch" },
      ],
    });
    expect(items[0]).toMatchObject({
      item: "Flour",
      quantity: 2,
      quantityMax: 4,
      recipeId: "r1",
    });
    // No quantity to scale — passes through untouched.
    expect(items[1]).toMatchObject({ item: "Salt", quantity: null });
  });
});

describe("aggregateShoppingList", () => {
  it("consolidates the same ingredient across multiple recipes", () => {
    const result = aggregateShoppingList([
      {
        recipeId: "a",
        servings: 4,
        desiredServings: 4,
        ingredients: [{ item: "Flour", quantity: 1, unit: "cup" }],
      },
      {
        recipeId: "b",
        servings: 4,
        desiredServings: 4,
        ingredients: [{ item: "flour", quantity: 1, unit: "cup" }],
      },
    ]);
    const flour = byItem(result.items, "Flour");
    expect(flour).toHaveLength(1);
    expect(flour[0]).toMatchObject({ quantity: 2, unit: "cup" });
    expect(flour[0]?.recipeIds).toEqual(["a", "b"]);
  });

  it("scales before consolidating", () => {
    const result = aggregateShoppingList([
      {
        servings: 2,
        desiredServings: 4,
        ingredients: [{ item: "Sugar", quantity: 1, unit: "cup" }],
      },
    ]);
    expect(result.items[0]).toMatchObject({ item: "Sugar", quantity: 2 });
  });

  it("groups items by grocery category in display order", () => {
    const result = aggregateShoppingList([
      {
        servings: 1,
        desiredServings: 1,
        ingredients: [
          { item: "Chicken breast", quantity: 1, unit: "lb" },
          { item: "Onion", quantity: 1 },
          { item: "Flour", quantity: 1, unit: "cup" },
        ],
      },
    ]);
    expect(result.groups.map((g) => g.category)).toEqual([
      "Produce",
      "Meat & Seafood",
      "Pantry",
    ]);
  });
});

describe("groupByCategory", () => {
  it("returns only non-empty categories, ordered", () => {
    const items = mergeShoppingItems([
      { item: "Flour", quantity: 1, unit: "cup" },
      { item: "Onion", quantity: 1 },
    ]);
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.category)).toEqual(["Produce", "Pantry"]);
  });
});

describe("describeQuantity", () => {
  it("formats counts, units and ranges", () => {
    expect(describeQuantity({ quantity: 3, quantityMax: null, unit: null })).toBe(
      "3",
    );
    expect(
      describeQuantity({ quantity: 2, quantityMax: null, unit: "cup" }),
    ).toBe("2 cups");
    expect(
      describeQuantity({ quantity: 1, quantityMax: null, unit: "cup" }),
    ).toBe("1 cup");
    expect(
      describeQuantity({ quantity: 2, quantityMax: 3, unit: "tbsp" }),
    ).toBe("2–3 tbsp");
    expect(
      describeQuantity({ quantity: null, quantityMax: null, unit: null }),
    ).toBe("");
  });
});

// Type export smoke test — keeps the public input type wired up.
const _sample: ShoppingItemInput = { item: "Water" };
void _sample;
