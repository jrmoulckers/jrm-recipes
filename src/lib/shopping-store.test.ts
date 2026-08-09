import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  migrateShoppingState,
  SHOPPING_HISTORY_LIMIT,
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
    restorePoints: [],
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

  it("adds empty per-list history when upgrading the multi-list store", () => {
    const migrated = migrateShoppingState(
      {
        lists: [defaultList()],
        defaultListId: "default",
        currentListId: "default",
        routes: [],
      },
      1,
    );

    expect(migrated.restorePoints).toEqual([]);
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

describe("bounded per-list recovery history", () => {
  it("separates removing completed items from unchecking them", () => {
    store().addManual("default", { item: "Eggs" });
    const itemId = list("default").items[0]!.id;
    store().setChecked(itemId, true);

    store().uncheckAll("default");
    expect(list("default").items).toMatchObject([
      { id: itemId, checked: false },
    ]);
    expect(store().restorePoints).toEqual([]);

    store().setChecked(itemId, true);
    const restorePointId = store().removeCompleted("default");
    expect(restorePointId).toBeTruthy();
    expect(list("default").items).toEqual([]);
    expect(store().restorePoints).toMatchObject([
      {
        id: restorePointId,
        listId: "default",
        operation: "remove-completed",
        items: [{ id: itemId, checked: true }],
      },
    ]);
  });

  it("restores an earlier snapshot and records the displaced current state", () => {
    store().addManual("default", { item: "Milk" });
    const originalId = list("default").items[0]!.id;
    const removedPointId = store().clearAll("default")!;
    store().addManual("default", { item: "Bread" });

    const undoPointId = store().restoreFromHistory("default", removedPointId);

    expect(list("default").items.map((item) => item.item)).toEqual(["Milk"]);
    expect(store().restorePoints[0]).toMatchObject({
      id: undoPointId,
      listId: "default",
      operation: "restore",
      items: [{ item: "Bread" }],
    });
    expect(
      store().restorePoints.some((point) => point.id === removedPointId),
    ).toBe(true);
    expect(list("default").items[0]!.id).toBe(originalId);
  });

  it("cannot restore a point into a different list", () => {
    store().addManual("default", { item: "Milk" });
    const pointId = store().clearAll("default")!;
    const other = store().createList("Warehouse", "Costco");

    expect(store().restoreFromHistory(other, pointId)).toBeNull();
    expect(list(other).items).toEqual([]);
    expect(list("default").items).toEqual([]);
  });

  it("keeps the newest 20 restore points for each list", () => {
    for (let index = 0; index < SHOPPING_HISTORY_LIMIT + 3; index++) {
      store().addManual("default", { item: `Item ${index}` });
      store().clearAll("default");
    }

    const points = store().restorePoints.filter(
      (point) => point.listId === "default",
    );
    expect(points).toHaveLength(SHOPPING_HISTORY_LIMIT);
    expect(points[0]!.items[0]!.item).toBe("Item 22");
    expect(points.at(-1)!.items[0]!.item).toBe("Item 3");
  });

  it("captures both lists before a bulk move", () => {
    const warehouse = store().createList("Warehouse", "Costco");
    store().addManual("default", { item: "Milk" });
    store().addManual("default", { item: "Eggs" });
    store().addManual(warehouse, { item: "Butter" });
    const moving = list("default").items.map((item) => item.id);

    const result = store().bulkMoveItems("default", moving, warehouse);

    expect(result).not.toBeNull();
    expect(list("default").items).toEqual([]);
    expect(
      list(warehouse)
        .items.map((item) => item.item)
        .sort(),
    ).toEqual(["Butter", "Eggs", "Milk"]);
    expect(
      store().restorePoints.find(
        (point) => point.id === result?.sourceRestorePointId,
      ),
    ).toMatchObject({
      listId: "default",
      operation: "bulk-move",
      items: [{ item: "Milk" }, { item: "Eggs" }],
    });
    expect(
      store().restorePoints.find(
        (point) => point.id === result?.targetRestorePointId,
      ),
    ).toMatchObject({
      listId: warehouse,
      operation: "bulk-move",
      items: [{ item: "Butter" }],
    });

    const undoPoints = store().restoreMultipleFromHistory([
      {
        listId: "default",
        restorePointId: result!.sourceRestorePointId,
      },
      {
        listId: warehouse,
        restorePointId: result!.targetRestorePointId,
      },
    ]);
    expect(undoPoints).toHaveLength(2);
    expect(list("default").items.map((item) => item.item)).toEqual([
      "Milk",
      "Eggs",
    ]);
    expect(list(warehouse).items.map((item) => item.item)).toEqual(["Butter"]);
  });

  it("captures list replacement without recording normal checkbox toggles", () => {
    store().addManual("default", { item: "Old item" });
    const old = list("default").items[0]!;
    store().setChecked(old.id, true);
    expect(store().restorePoints).toEqual([]);

    const replacement: LocalShoppingItem = {
      ...old,
      id: "replacement",
      item: "New item",
      checked: false,
    };
    const restorePointId = store().replaceListItems("default", [replacement]);

    expect(list("default").items).toEqual([replacement]);
    expect(store().restorePoints[0]).toMatchObject({
      id: restorePointId,
      operation: "list-rebuild",
      items: [{ item: "Old item", checked: true }],
    });
  });
});
