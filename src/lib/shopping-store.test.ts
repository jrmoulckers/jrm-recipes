import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShoppingStore } from "./shopping-store";
import type { ShoppingRecipeInput } from "./shopping-list";

/**
 * Unit tests for the offline shopping-list store (issue #229). The store is a
 * persisted Zustand singleton, so we reset its state (and the backing
 * localStorage) before each test to prevent cross-test leakage.
 */

function reset() {
  useShoppingStore.setState({ items: [] });
  localStorage.clear();
}

const store = () => useShoppingStore.getState();

function recipe(
  ingredients: ShoppingRecipeInput["ingredients"],
  extra: Partial<ShoppingRecipeInput> = {},
): ShoppingRecipeInput {
  return { ingredients, ...extra };
}

beforeEach(reset);
afterEach(() => {
  vi.unstubAllGlobals();
  reset();
});

describe("addRecipe consolidation", () => {
  it("merges duplicate ingredients across two recipes into one line", () => {
    store().addRecipe(recipe([{ item: "Flour", quantity: 1, unit: "cup" }]));
    store().addRecipe(recipe([{ item: "Flour", quantity: 2, unit: "cup" }]));

    const flour = store().items.filter((i) => i.item.toLowerCase() === "flour");
    expect(flour).toHaveLength(1);
    expect(flour[0]?.quantity).toBe(3);
    expect(flour[0]?.unit).toBe("cup");
  });

  it("preserves already-checked items instead of re-consolidating them", () => {
    store().addRecipe(recipe([{ item: "Flour", quantity: 1, unit: "cup" }]));
    const flourId = store().items[0]!.id;
    store().setChecked(flourId, true);

    // A second recipe with more flour must not fold into the checked line.
    store().addRecipe(recipe([{ item: "Flour", quantity: 2, unit: "cup" }]));

    const flour = store().items.filter((i) => i.item.toLowerCase() === "flour");
    expect(flour).toHaveLength(2);
    expect(flour.some((i) => i.checked && i.quantity === 1)).toBe(true);
    expect(flour.some((i) => !i.checked && i.quantity === 2)).toBe(true);
  });

  it("preserves noted items untouched across a re-consolidation", () => {
    store().addManual({ item: "Flour", quantity: 1, unit: "cup", note: "organic" });
    store().addRecipe(recipe([{ item: "Flour", quantity: 2, unit: "cup" }]));

    const noted = store().items.find((i) => i.note === "organic");
    expect(noted).toBeDefined();
    expect(noted?.quantity).toBe(1);
  });
});

describe("addManual", () => {
  it("trims input, categorizes, and appends a new unchecked item", () => {
    store().addManual({ item: "  Milk  ", unit: "  L " });

    const item = store().items.at(-1)!;
    expect(item.item).toBe("Milk");
    expect(item.unit).toBe("L");
    expect(item.checked).toBe(false);
    expect(item.recipeId).toBeNull();
    expect(item.category).toBeTruthy();
    expect(item.id).toBeTruthy();
  });

  it("gives each manual item a unique id", () => {
    store().addManual({ item: "Salt" });
    store().addManual({ item: "Pepper" });
    const ids = store().items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("state mutations", () => {
  it("setChecked flips exactly the targeted item", () => {
    store().addManual({ item: "Eggs" });
    store().addManual({ item: "Butter" });
    const [a, b] = store().items;
    store().setChecked(a!.id, true);

    const items = store().items;
    expect(items.find((i) => i.id === a!.id)?.checked).toBe(true);
    expect(items.find((i) => i.id === b!.id)?.checked).toBe(false);
  });

  it("remove deletes by id", () => {
    store().addManual({ item: "Eggs" });
    const id = store().items[0]!.id;
    store().remove(id);
    expect(store().items.find((i) => i.id === id)).toBeUndefined();
  });

  it("clearChecked drops only checked items", () => {
    store().addManual({ item: "Eggs" });
    store().addManual({ item: "Butter" });
    store().setChecked(store().items[0]!.id, true);

    store().clearChecked();

    const items = store().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.item).toBe("Butter");
  });

  it("clearAll empties the list", () => {
    store().addManual({ item: "Eggs" });
    store().addManual({ item: "Butter" });
    store().clearAll();
    expect(store().items).toHaveLength(0);
  });
});

describe("id generation fallback", () => {
  it("still produces unique ids when crypto.randomUUID is unavailable", () => {
    // Simulate an environment without crypto.randomUUID (the uid() fallback).
    vi.stubGlobal("crypto", {});

    store().addManual({ item: "Sugar" });
    store().addManual({ item: "Cocoa" });

    const ids = store().items.map((i) => i.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
