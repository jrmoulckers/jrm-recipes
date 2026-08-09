import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  migrateShoppingState,
  useShoppingStore,
  type LocalShoppingItem,
  type LocalShoppingList,
} from "./shopping-store";
import type { ShoppingRecipeInput } from "./shopping-list";

const defaultList = (): LocalShoppingList => ({
  id: "default",
  name: "Neighborhood market",
  storeName: "QFC",
  isDefault: true,
  archived: false,
  items: [],
});

function reset() {
  useShoppingStore.setState({
    lists: [defaultList()],
    defaultListId: "default",
    currentListId: "default",
    routes: [],
  });
  localStorage.clear();
}

const store = () => useShoppingStore.getState();
const list = (id: string) => store().lists.find((item) => item.id === id)!;

function recipe(
  ingredients: ShoppingRecipeInput["ingredients"],
): ShoppingRecipeInput {
  return { ingredients };
}

beforeEach(reset);
afterEach(() => {
  vi.unstubAllGlobals();
  reset();
});

describe("persisted migration", () => {
  it("moves every legacy flat item into one explicit default list", () => {
    const legacyItem = {
      id: "legacy",
      item: "Milk",
      quantity: 1,
      quantityMax: null,
      unit: "gal",
      note: null,
      category: "Dairy & Eggs",
      optional: false,
      checked: false,
      recipeId: null,
    } as LocalShoppingItem;

    const migrated = migrateShoppingState({ items: [legacyItem] }, 0);

    expect(migrated.defaultListId).toBe("local-default");
    expect(migrated.currentListId).toBe("local-default");
    expect(migrated.lists?.[0]?.items).toEqual([legacyItem]);
    expect(migrated.routes).toEqual([]);
  });

  it("recovers a valid empty default from malformed legacy data", () => {
    const migrated = migrateShoppingState({ items: "broken" }, 0);
    expect(migrated.lists?.[0]?.items).toEqual([]);
  });
});

describe("independent current and default lists", () => {
  it("viewing another list does not change fallback routing", () => {
    const viewed = store().createList("Warehouse", "Costco");
    store().setCurrentList(viewed);
    store().addRecipe(recipe([{ item: "Milk", quantity: 1 }]));

    expect(store().currentListId).toBe(viewed);
    expect(store().defaultListId).toBe("default");
    expect(list("default").items.map((item) => item.item)).toEqual(["Milk"]);
    expect(list(viewed).items).toEqual([]);
  });

  it("changes the fallback only through makeDefault", () => {
    const warehouse = store().createList("Warehouse", "Costco");
    store().makeDefault(warehouse);
    store().addRecipe(recipe([{ item: "Milk", quantity: 1 }]));

    expect(store().defaultListId).toBe(warehouse);
    expect(list(warehouse).isDefault).toBe(true);
    expect(list("default").isDefault).toBe(false);
    expect(list(warehouse).items).toHaveLength(1);
  });
});

describe("routing and list lifecycle", () => {
  it("routes an ingredient to one preferred list and not its alternatives", () => {
    const costco = store().createList("Warehouse", "Costco");
    store().addManual("default", { item: "Onion", foodId: "food-onion" });
    const onion = list("default").items[0]!;
    store().moveItem(onion.id, costco, true, ["default"]);
    store().addRecipe(
      recipe([{ item: "Yellow onion", foodId: "food-onion", quantity: 2 }]),
    );

    expect(list(costco).items).toHaveLength(1);
    expect(list(defaultList().id).items).toHaveLength(0);
    expect(store().routes[0]?.alternativeListIds).toEqual(["default"]);
  });

  it("promotes an active alternative when a preferred list is archived", () => {
    const costco = store().createList("Warehouse", "Costco");
    store().addManual("default", { item: "Onion" });
    store().moveItem(list("default").items[0]!.id, costco, true, ["default"]);

    store().archiveList(costco);

    expect(store().routes[0]?.preferredListId).toBe("default");
    expect(store().defaultListId).toBe("default");
    expect(store().currentListId).toBe("default");
  });

  it("preserves a non-preferred alternative across archive and restore", () => {
    const costco = store().createList("Warehouse", "Costco");
    const source = store().createList("Temporary", null);
    store().addManual(source, { item: "Onion" });
    store().moveItem(list(source).items[0]!.id, "default", true, [costco]);

    store().archiveList(costco);
    expect(store().routes[0]?.alternativeListIds).toEqual([costco]);

    store().restoreList(costco);
    expect(store().routes[0]?.alternativeListIds).toEqual([costco]);
  });

  it("promotes a new default only when the default is archived", () => {
    const costco = store().createList("Warehouse", "Costco");
    store().setCurrentList(costco);
    store().archiveList("default");

    expect(store().defaultListId).toBe(costco);
    expect(store().currentListId).toBe(costco);
    expect(list(costco).isDefault).toBe(true);
  });
});

describe("per-list item mutations", () => {
  it("consolidates duplicate recipe ingredients inside their destination", () => {
    store().addRecipe(recipe([{ item: "Flour", quantity: 1, unit: "cup" }]));
    store().addRecipe(recipe([{ item: "Flour", quantity: 2, unit: "cup" }]));
    expect(list("default").items).toMatchObject([
      { item: "Flour", quantity: 3, unit: "cup" },
    ]);
  });

  it("clears only the requested list", () => {
    const costco = store().createList("Warehouse", "Costco");
    store().addManual("default", { item: "Eggs" });
    store().addManual(costco, { item: "Butter" });
    store().clearAll(costco);

    expect(list("default").items.map((item) => item.item)).toEqual(["Eggs"]);
    expect(list(costco).items).toEqual([]);
  });

  it("still creates unique ids without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    store().addManual("default", { item: "Sugar" });
    store().addManual("default", { item: "Cocoa" });
    const ids = list("default").items.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
  });
});
