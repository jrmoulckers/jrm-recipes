import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  migrateShoppingState,
  SHOPPING_HISTORY_LIMIT,
  mergeShoppingState,
  useShoppingStore,
  type LocalShoppingItem,
  type LocalShoppingList,
} from "./shopping-store";
import type { ShoppingRecipeInput } from "./shopping-list";
import { DEFAULT_UNIT_PREFS } from "./units";

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
    unitPreferences: { ...DEFAULT_UNIT_PREFS },
    customUnits: [],
    packageRounding: false,
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
    expect(migrated.lists?.[0]?.items[0]).toMatchObject(legacyItem);
    expect(typeof migrated.lists?.[0]?.items[0]?.aggregationKey).toBe("string");
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

  it("preserves duplicate legacy entities while assigning globally unique ids", () => {
    const duplicate = {
      id: "same-key",
      item: "Milk",
      foodId: "food-milk",
      quantity: 1,
      quantityMax: null,
      unit: "l",
      note: null,
      category: "Dairy & Eggs",
      optional: false,
      checked: false,
      recipeId: null,
    } as LocalShoppingItem;
    const oldState = {
      lists: [
        { ...defaultList(), items: [duplicate] },
        {
          ...defaultList(),
          id: "second",
          isDefault: false,
          items: [{ ...duplicate, checked: true }],
        },
      ],
    };

    const migrated = migrateShoppingState(oldState, 3);
    const items = migrated.lists!.flatMap((candidate) => candidate.items);

    expect(items).toHaveLength(2);
    expect(new Set(items.map((candidate) => candidate.id)).size).toBe(2);
    expect(
      new Set(items.map((candidate) => candidate.aggregationKey)).size,
    ).toBe(1);
  });

  it("hydrates version-one lists and routes with safe package defaults", () => {
    const oldItem = {
      id: "milk",
      item: "Milk",
      foodId: null,
      quantity: 3,
      quantityMax: null,
      unit: "cup",
      note: null,
      category: "Dairy & Eggs",
      optional: false,
      checked: false,
      recipeId: null,
    } as LocalShoppingItem;
    const oldState = {
      lists: [{ ...defaultList(), items: [oldItem] }],
      defaultListId: "default",
      currentListId: "default",
      routes: [],
    };

    const hydrated = mergeShoppingState(
      migrateShoppingState(oldState, 1),
      store(),
    );

    expect(hydrated.packageRounding).toBe(false);
    expect(hydrated.customUnits).toEqual([]);
    expect(hydrated.unitPreferences).toEqual(DEFAULT_UNIT_PREFS);
    expect(hydrated.lists[0]?.items[0]).toMatchObject({
      requiredBaseQuantity: 709.764,
      requiredBaseQuantityMax: null,
      requiredBaseUnit: "ml",
      purchaseQuantity: null,
      packageCount: null,
      packageLabel: null,
    });
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
    store().moveItem("default", onion.id, costco, true, ["default"]);
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
    store().moveItem("default", list("default").items[0]!.id, costco, true, [
      "default",
    ]);

    store().archiveList(costco);

    expect(store().routes[0]?.preferredListId).toBe("default");
    expect(store().defaultListId).toBe("default");
    expect(store().currentListId).toBe("default");
  });

  it("preserves a non-preferred alternative across archive and restore", () => {
    const costco = store().createList("Warehouse", "Costco");
    const source = store().createList("Temporary", null);
    store().addManual(source, { item: "Onion" });
    store().moveItem(source, list(source).items[0]!.id, "default", true, [
      costco,
    ]);

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

  it.each(["archiveList", "deleteList"] as const)(
    "falls back to the explicit default when the viewed list is removed by %s",
    (operation) => {
      const costco = store().createList("Warehouse", "Costco");
      store().makeDefault(costco);
      const temporary = store().createList("Temporary", null);

      store()[operation](temporary);

      expect(store().currentListId).toBe(costco);
      expect(store().defaultListId).toBe(costco);
      expect(list(costco).isDefault).toBe(true);
    },
  );
});

describe("per-list item mutations", () => {
  it("consolidates duplicate recipe ingredients inside their destination", () => {
    store().setUnitPreferences(
      { ...DEFAULT_UNIT_PREFS, defaultSystem: "us" },
      false,
    );
    store().addRecipe(recipe([{ item: "Flour", quantity: 1, unit: "cup" }]));
    const originalId = list("default").items[0]!.id;
    store().addRecipe(recipe([{ item: "Flour", quantity: 2, unit: "cup" }]));
    expect(list("default").items).toMatchObject([
      { id: originalId, item: "Flour", quantity: 3, unit: "cup" },
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

  it("keeps aggregate identity separate from unique entities and scopes mutations", () => {
    const warehouse = store().createList("Warehouse");
    store().addRecipe(recipe([{ item: "Milk", foodId: "milk", quantity: 1 }]));
    const checked = list("default").items[0]!;
    store().setChecked("default", checked.id, true);
    store().addRecipe(recipe([{ item: "Milk", foodId: "milk", quantity: 2 }]));
    store().addManual(warehouse, {
      item: "Milk",
      foodId: "milk",
      quantity: 3,
    });

    const defaultItems = list("default").items;
    const warehouseItem = list(warehouse).items[0]!;
    expect(defaultItems).toHaveLength(2);
    expect(
      new Set([...defaultItems, warehouseItem].map((candidate) => candidate.id))
        .size,
    ).toBe(3);
    expect(defaultItems[0]?.aggregationKey).toBe(
      defaultItems[1]?.aggregationKey,
    );
    expect(defaultItems[0]?.aggregationKey).toBe(warehouseItem.aggregationKey);

    store().setChecked("default", defaultItems[1]!.id, true);
    expect(list("default").items.map((candidate) => candidate.checked)).toEqual(
      [true, true],
    );
    expect(list(warehouse).items[0]?.checked).toBe(false);
    store().setCategory(warehouse, warehouseItem.id, "Bakery");
    expect(list(warehouse).items[0]?.category).toBe("Bakery");
    expect(list("default").items[0]?.category).not.toBe("Bakery");

    store().remove("default", defaultItems[1]!.id);
    expect(list("default").items.map((candidate) => candidate.id)).toEqual([
      checked.id,
    ]);
    expect(list(warehouse).items).toHaveLength(1);
  });
});

describe("offline quantity and package preferences", () => {
  it("uses the same aggregation options for preferences and custom units", () => {
    store().setUnitPreferences(
      { ...DEFAULT_UNIT_PREFS, defaultSystem: "metric" },
      false,
    );
    store().createCustomUnit({
      name: "bottle",
      abbreviation: "btl",
      dimension: "volume",
      baseUnit: "ml",
      baseAmount: 750,
      displayAsTrue: true,
    });
    store().addRecipe(
      recipe([{ item: "Juice", quantity: 1, unit: "l", foodId: "juice" }]),
    );
    const juice = list("default").items[0]!;

    store().saveIngredientPackage({
      itemId: juice.id,
      listId: "default",
      preferredListId: "default",
      packageAmount: 1,
      packageUnit: "bottle",
      packageLabel: "glass bottle",
      packageRoundBehavior: "enable",
    });

    expect(list("default").items[0]).toMatchObject({
      quantity: 1,
      unit: "l",
      packageCount: 2,
      purchaseQuantity: 2,
      purchaseUnit: "bottle",
      packageLabel: "glass bottle",
    });
  });

  it("canonicalizes package routes through create, rename, and delete", () => {
    store().addManual("default", {
      item: "Juice",
      foodId: "juice",
      quantity: 1,
      unit: "l",
    });
    const juice = list("default").items[0]!;
    store().saveIngredientPackage({
      itemId: juice.id,
      listId: "default",
      preferredListId: "default",
      packageAmount: 1,
      packageUnit: "btl",
      packageLabel: "glass bottle",
      packageRoundBehavior: "enable",
    });

    const customId = store().createCustomUnit({
      name: "bottle",
      abbreviation: "btl",
      dimension: "volume",
      baseUnit: "ml",
      baseAmount: 750,
      displayAsTrue: true,
    });
    expect(store().routes[0]).toMatchObject({
      packageAmount: 750,
      packageUnit: "ml",
      packageLabel: "glass bottle",
      packageRoundBehavior: "enable",
      preferredListId: "default",
    });
    expect(list("default").items[0]?.packageCount).toBe(2);

    store().updateCustomUnit(customId, {
      name: "flask",
      abbreviation: "fl",
      dimension: "volume",
      baseUnit: "l",
      baseAmount: 1,
      displayAsTrue: false,
    });
    expect(store().routes[0]).toMatchObject({
      packageAmount: 750,
      packageUnit: "ml",
    });
    expect(list("default").items[0]?.packageCount).toBe(2);

    store().deleteCustomUnit(customId);
    expect(store().routes[0]).toMatchObject({
      packageAmount: 750,
      packageUnit: "ml",
    });
    expect(list("default").items[0]?.packageCount).toBe(2);
  });

  it("inherits the off-by-default global setting and never rounds below a range", () => {
    store().setUnitPreferences(
      { ...DEFAULT_UNIT_PREFS, defaultSystem: "us" },
      false,
    );
    store().addManual("default", {
      item: "Milk",
      quantity: 3,
      quantityMax: 5,
      unit: "cup",
    });
    const milk = list("default").items[0]!;
    store().saveIngredientPackage({
      itemId: milk.id,
      listId: "default",
      preferredListId: "default",
      packageAmount: 4,
      packageUnit: "cup",
      packageLabel: "carton",
      packageRoundBehavior: "inherit",
    });
    expect(list("default").items[0]?.packageCount).toBeNull();

    store().setUnitPreferences(store().unitPreferences, true);

    expect(list("default").items[0]).toMatchObject({
      quantity: 1.5,
      quantityMax: 2.5,
      unit: "pint",
      packageCount: 2,
      purchaseQuantity: 8,
      purchaseUnit: "cup",
    });
  });

  it("saves package metadata on the existing preferred-store route", () => {
    const warehouse = store().createList("Warehouse", "Costco");
    store().addManual("default", { item: "Rice", foodId: "food-rice" });
    const rice = list("default").items[0]!;

    store().saveIngredientPackage({
      itemId: rice.id,
      listId: "default",
      preferredListId: warehouse,
      packageAmount: 5,
      packageUnit: "lb",
      packageRoundBehavior: "disable",
    });

    expect(store().routes).toHaveLength(1);
    expect(store().routes[0]).toMatchObject({
      foodId: "food-rice",
      preferredListId: warehouse,
      packageAmount: 5,
      packageUnit: "lb",
      packageRoundBehavior: "disable",
    });
  });

  it("scopes a package edit by list even if legacy entity ids collide", () => {
    const warehouse = store().createList("Warehouse", "Costco");
    store().addManual("default", {
      item: "Milk",
      foodId: "food-milk",
      quantity: 1,
      unit: "l",
    });
    store().addManual(warehouse, {
      item: "Flour",
      foodId: "food-flour",
      quantity: 1,
      unit: "kg",
    });
    const sharedId = list("default").items[0]!.id;
    useShoppingStore.setState((state) => ({
      lists: state.lists.map((candidate) =>
        candidate.id === warehouse
          ? {
              ...candidate,
              items: candidate.items.map((candidateItem) => ({
                ...candidateItem,
                id: sharedId,
              })),
            }
          : candidate,
      ),
    }));

    store().saveIngredientPackage({
      itemId: sharedId,
      listId: warehouse,
      preferredListId: warehouse,
      packageAmount: 500,
      packageUnit: "g",
      packageRoundBehavior: "enable",
    });

    expect(store().routes).toMatchObject([
      { foodId: "food-flour", packageAmount: 500, packageUnit: "g" },
    ]);
    expect(list("default").items[0]?.packageCount).toBeNull();
    expect(list(warehouse).items[0]?.packageCount).toBe(2);
  });

  it("reaggregates identical items in separate lists from their own requirements", () => {
    const archived = store().createList("Archived market");
    store().addManual("default", {
      item: "Milk",
      foodId: "food-milk",
      quantity: 1,
      unit: "cup",
    });
    store().addManual(archived, {
      item: "Milk",
      foodId: "food-milk",
      quantity: 3,
      unit: "cup",
    });
    store().archiveList(archived);
    const source = list("default").items[0]!;
    useShoppingStore.setState((state) => ({
      lists: state.lists.map((candidate) =>
        candidate.id === archived
          ? {
              ...candidate,
              items: candidate.items.map((item) => ({
                ...item,
                id: source.id,
              })),
            }
          : candidate,
      ),
    }));
    expect(list(archived).items[0]?.id).toBe(source.id);

    store().saveIngredientPackage({
      itemId: source.id,
      listId: "default",
      preferredListId: "default",
      packageAmount: 1,
      packageUnit: "cup",
      packageRoundBehavior: "enable",
    });

    expect(list("default").items[0]).toMatchObject({
      requiredBaseQuantity: 236.588,
      packageCount: 1,
      purchaseQuantity: 1,
    });
    expect(list(archived).items[0]).toMatchObject({
      requiredBaseQuantity: 709.764,
      packageCount: 3,
      purchaseQuantity: 3,
    });
  });

  it("keeps the canonical requirement when a custom unit is edited or deleted", () => {
    const customId = store().createCustomUnit({
      name: "scoop",
      abbreviation: null,
      dimension: "volume",
      baseUnit: "cup",
      baseAmount: 0.5,
      displayAsTrue: false,
    });
    store().setUnitPreferences(
      {
        ...DEFAULT_UNIT_PREFS,
        defaultSystem: "metric",
        dryVolumeUnit: "scoop",
      },
      false,
    );
    store().addManual("default", {
      item: "Flour",
      quantity: 1,
      unit: "scoop",
    });

    expect(list("default").items[0]).toMatchObject({
      requiredBaseQuantity: 118.294,
      requiredBaseUnit: "ml",
    });

    store().updateCustomUnit(customId, {
      name: "scoop",
      abbreviation: null,
      dimension: "volume",
      baseUnit: "cup",
      baseAmount: 1,
      displayAsTrue: false,
    });
    expect(list("default").items[0]).toMatchObject({
      quantity: 0.5,
      unit: "scoop",
      requiredBaseQuantity: 118.294,
      requiredBaseUnit: "ml",
    });

    store().deleteCustomUnit(customId);
    expect(list("default").items[0]).toMatchObject({
      quantity: 118.294,
      unit: "ml",
      requiredBaseQuantity: 118.294,
      requiredBaseUnit: "ml",
    });
  });

  it("canonicalizes persisted unknown units when a definition is created", () => {
    useShoppingStore.setState((state) => ({
      lists: state.lists.map((candidate) => ({
        ...candidate,
        items: [
          {
            id: "legacy-scoop",
            aggregationKey: "legacy-scoop",
            item: "Flour",
            foodId: null,
            quantity: 2,
            quantityMax: null,
            unit: "scoop",
            requiredBaseQuantity: 2,
            requiredBaseQuantityMax: null,
            requiredBaseUnit: "scoop",
            purchaseQuantity: null,
            purchaseUnit: null,
            packageCount: null,
            packageAmount: null,
            packageUnit: null,
            packageLabel: null,
            note: null,
            category: "Pantry",
            optional: false,
            checked: false,
            recipeId: null,
          },
        ],
      })),
    }));

    store().createCustomUnit({
      name: "scoop",
      abbreviation: "scp",
      dimension: "volume",
      baseUnit: "cup",
      baseAmount: 0.5,
      displayAsTrue: false,
    });

    expect(list("default").items[0]).toMatchObject({
      requiredBaseQuantity: 236.588,
      requiredBaseUnit: "ml",
    });
  });

  it("uses the old definition for persisted name and abbreviation matches", () => {
    const customId = store().createCustomUnit({
      name: "scoop",
      abbreviation: "scp",
      dimension: "volume",
      baseUnit: "cup",
      baseAmount: 0.5,
      displayAsTrue: false,
    });
    useShoppingStore.setState((state) => ({
      lists: state.lists.map((candidate) => ({
        ...candidate,
        items: [
          {
            id: "persisted-name",
            aggregationKey: "persisted-name",
            item: "Flour",
            foodId: null,
            quantity: 2,
            quantityMax: null,
            unit: "scoop",
            requiredBaseQuantity: 2,
            requiredBaseQuantityMax: null,
            requiredBaseUnit: "scoop",
            purchaseQuantity: null,
            purchaseUnit: null,
            packageCount: null,
            packageAmount: null,
            packageUnit: null,
            packageLabel: null,
            note: null,
            category: "Pantry",
            optional: false,
            checked: false,
            recipeId: null,
          },
          {
            id: "persisted-abbreviation",
            aggregationKey: "persisted-abbreviation",
            item: "Sugar",
            foodId: null,
            quantity: 3,
            quantityMax: null,
            unit: "SCP",
            requiredBaseQuantity: 3,
            requiredBaseQuantityMax: null,
            requiredBaseUnit: "SCP",
            purchaseQuantity: null,
            purchaseUnit: null,
            packageCount: null,
            packageAmount: null,
            packageUnit: null,
            packageLabel: null,
            note: null,
            category: "Pantry",
            optional: false,
            checked: false,
            recipeId: null,
          },
        ],
      })),
    }));

    store().updateCustomUnit(customId, {
      name: "measure",
      abbreviation: "msr",
      dimension: "volume",
      baseUnit: "cup",
      baseAmount: 1,
      displayAsTrue: false,
    });

    expect(list("default").items).toMatchObject([
      { requiredBaseQuantity: 236.588, requiredBaseUnit: "ml" },
      { requiredBaseQuantity: 354.882, requiredBaseUnit: "ml" },
    ]);

    store().deleteCustomUnit(customId);
    expect(list("default").items).toMatchObject([
      { requiredBaseQuantity: 236.588, requiredBaseUnit: "ml" },
      { requiredBaseQuantity: 354.882, requiredBaseUnit: "ml" },
    ]);
  });

  it("canonicalizes an abbreviation-backed requirement before offline deletion", () => {
    const customId = store().createCustomUnit({
      name: "scoop",
      abbreviation: "scp",
      dimension: "volume",
      baseUnit: "cup",
      baseAmount: 0.5,
      displayAsTrue: false,
    });
    useShoppingStore.setState((state) => ({
      lists: state.lists.map((candidate) => ({
        ...candidate,
        items: [
          {
            id: "persisted-abbreviation",
            aggregationKey: "persisted-abbreviation",
            item: "Sugar",
            foodId: null,
            quantity: 3,
            quantityMax: null,
            unit: "SCP",
            requiredBaseQuantity: 3,
            requiredBaseQuantityMax: null,
            requiredBaseUnit: "SCP",
            purchaseQuantity: null,
            purchaseUnit: null,
            packageCount: null,
            packageAmount: null,
            packageUnit: null,
            packageLabel: null,
            note: null,
            category: "Pantry",
            optional: false,
            checked: false,
            recipeId: null,
          },
        ],
      })),
    }));

    store().deleteCustomUnit(customId);

    expect(list("default").items[0]).toMatchObject({
      quantity: 354.882,
      unit: "ml",
      requiredBaseQuantity: 354.882,
      requiredBaseUnit: "ml",
    });
  });
});

describe("bounded per-list recovery history", () => {
  it("separates removing completed items from unchecking them", () => {
    store().addManual("default", { item: "Eggs" });
    const itemId = list("default").items[0]!.id;
    store().setChecked("default", itemId, true);

    store().uncheckAll("default");
    expect(list("default").items).toMatchObject([
      { id: itemId, checked: false },
    ]);
    expect(store().restorePoints).toEqual([]);

    store().setChecked("default", itemId, true);
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
    store().setChecked("default", old.id, true);
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
