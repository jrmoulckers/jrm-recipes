import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

const {
  transactionMock,
  getRecipeMock,
  groupMembersMock,
  mealPlanEntriesMock,
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  getRecipeMock: vi.fn(),
  groupMembersMock: vi.fn(),
  mealPlanEntriesMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      groupMembers: { findFirst: groupMembersMock },
      mealPlanEntries: { findMany: mealPlanEntriesMock },
    },
  },
}));
vi.mock("~/server/recipes/queries", () => ({ getRecipe: getRecipeMock }));
vi.mock("~/server/dietary/gating", () => ({
  planWarningsForRecipes: vi.fn(async () => new Map()),
}));

import {
  shoppingListItems,
  shoppingListRestorePointItems,
  shoppingListRestorePoints,
  type User,
} from "~/server/db/schema";
import {
  addRecipeToList,
  archiveShoppingList,
  buildListFromPlan,
  bulkMoveShoppingItems,
  clearChecked,
  clearList,
  moveShoppingItem,
  renameShoppingList,
  renameShoppingStore,
  deleteShoppingStore,
  restoreShoppingListPoint,
  restoreShoppingListPoints,
  setItemChecked,
  uncheckAll,
  saveIngredientPackage,
} from "./mutations";

const user = { id: "user_1" } as User;

type ListRow = {
  id: string;
  userId: string;
  isDefault: boolean;
  archivedAt: Date | null;
  name?: string;
};

function list(id: string, overrides: Partial<ListRow> = {}): ListRow {
  return {
    id,
    userId: user.id,
    isDefault: false,
    archivedAt: null,
    name: id,
    ...overrides,
  };
}

function fakeTx() {
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const sets: unknown[] = [];
  const wheres: unknown[] = [];
  const selectWheres: unknown[] = [];
  const lockResults: unknown[][] = [];
  let currentTable: unknown;
  let restorePointSequence = 0;
  const chain = {
    values: vi.fn((values: unknown) => {
      inserted.push({ table: currentTable, values });
      return chain;
    }),
    set: vi.fn((values: unknown) => {
      sets.push(values);
      return chain;
    }),
    where: vi.fn((where: unknown) => {
      wheres.push(where);
      return Promise.resolve([]);
    }),
    returning: vi.fn(async () => [
      {
        id:
          currentTable === shoppingListRestorePoints
            ? `restore_${++restorePointSequence}`
            : "created_1",
      },
    ]),
  };
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn((where: unknown) => {
      selectWheres.push(where);
      return selectChain;
    }),
    for: vi.fn(async () => {
      if (lockResults.length > 0) return lockResults.shift();
      const params = new PgDialect().sqlToQuery(
        selectWheres.at(-1) as never,
      ).params;
      return [list(String(params[0]))];
    }),
    then: (
      resolve: (value: Array<{ next: number }>) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve([{ next: 0 }]).then(resolve, reject),
  };
  const tx = {
    inserted,
    lockResults,
    sets,
    selectWheres,
    wheres,
    query: {
      shoppingLists: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      shoppingStores: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      shoppingListItems: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      shoppingListRestorePoints: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      shoppingIngredientRoutes: {
        findMany: vi.fn(),
      },
      shoppingIngredientRouteAlternatives: {
        findMany: vi.fn(),
      },
      userUnitPreferences: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      customUnits: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn((table: unknown) => {
      currentTable = table;
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      currentTable = table;
      return chain;
    }),
    delete: vi.fn((table: unknown) => {
      currentTable = table;
      return chain;
    }),
    select: vi.fn(() => selectChain),
    selectChain,
  };
  return tx;
}

function runWith(tx: ReturnType<typeof fakeTx>) {
  transactionMock.mockImplementation(
    async (callback: (value: typeof tx) => unknown) => callback(tx),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shopping list ownership", () => {
  it("returns NOT_FOUND before renaming another user's list", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findFirst.mockResolvedValue(
      list("foreign", { userId: "user_2" }),
    );
    runWith(tx);

    await expect(
      renameShoppingList(user, {
        listId: "foreign",
        name: "Not mine",
        storeIds: [],
        newStoreNames: [],
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("refuses to link a store the user does not own", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findFirst.mockResolvedValue(list("mine"));
    tx.query.shoppingStores.findMany.mockResolvedValue([]);
    runWith(tx);

    await expect(
      renameShoppingList(user, {
        listId: "mine",
        name: "Weekly",
        storeIds: ["foreign_store"],
        newStoreNames: [],
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND before renaming another user's store", async () => {
    const tx = fakeTx();
    tx.query.shoppingStores.findFirst.mockResolvedValue({
      id: "foreign",
      userId: "user_2",
    });
    runWith(tx);

    await expect(
      renameShoppingStore(user, { storeId: "foreign", name: "Not mine" }),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND before deleting another user's store", async () => {
    const tx = fakeTx();
    tx.query.shoppingStores.findFirst.mockResolvedValue({
      id: "foreign",
      userId: "user_2",
    });
    runWith(tx);

    await expect(deleteShoppingStore(user, "foreign")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("rejects foreign move targets and alternatives as NOT_FOUND", async () => {
    const item = {
      id: "item_1",
      listId: "list_a",
      item: "Milk",
      list: { userId: user.id },
    };

    const foreignTargetTx = fakeTx();
    foreignTargetTx.query.shoppingListItems.findFirst.mockResolvedValue(item);
    foreignTargetTx.lockResults.push([list("list_a")], []);
    runWith(foreignTargetTx);
    await expect(
      moveShoppingItem(user, {
        itemId: item.id,
        targetListId: "list_b",
        rememberRoute: false,
        alternativeListIds: [],
      }),
    ).rejects.toThrow("NOT_FOUND");

    const foreignAlternativeTx = fakeTx();
    foreignAlternativeTx.query.shoppingListItems.findFirst.mockResolvedValue(
      item,
    );
    foreignAlternativeTx.query.shoppingLists.findFirst.mockResolvedValue(
      list("list_c", { userId: "user_2" }),
    );
    runWith(foreignAlternativeTx);
    await expect(
      moveShoppingItem(user, {
        itemId: item.id,
        targetListId: "list_b",
        rememberRoute: true,
        alternativeListIds: ["list_c"],
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(foreignAlternativeTx.update).not.toHaveBeenCalled();
  });

  it("rejects foreign item and store references before saving a package route", async () => {
    const foreignItemTx = fakeTx();
    foreignItemTx.query.shoppingListItems.findFirst.mockResolvedValue({
      id: "foreign_item",
      listId: "list_a",
      item: "Milk",
      list: { userId: "user_2" },
    });
    foreignItemTx.query.shoppingLists.findFirst.mockResolvedValue(
      list("list_a"),
    );
    runWith(foreignItemTx);
    await expect(
      saveIngredientPackage(user, {
        itemId: "foreign_item",
        listId: "list_a",
        preferredListId: "store",
        packageAmount: 1,
        packageUnit: "l",
        packageRoundBehavior: "inherit",
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(foreignItemTx.query.shoppingLists.findFirst).toHaveBeenCalledTimes(
      1,
    );

    const tx = fakeTx();
    tx.query.shoppingListItems.findFirst.mockResolvedValue({
      id: "item_1",
      listId: "list_a",
      item: "Milk",
      foodId: "food_milk",
      list: { userId: user.id },
    });
    tx.query.shoppingLists.findFirst.mockResolvedValue(
      list("foreign", { userId: "user_2" }),
    );
    runWith(tx);

    await expect(
      saveIngredientPackage(user, {
        itemId: "item_1",
        listId: "list_a",
        preferredListId: "foreign",
        packageAmount: 1,
        packageUnit: "l",
        packageLabel: "Carton",
        packageRoundBehavior: "enable",
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.query.shoppingIngredientRoutes.findMany).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("updates one owned route and persists required and purchase amounts separately", async () => {
    const tx = fakeTx();
    tx.query.shoppingListItems.findFirst.mockResolvedValue({
      id: "item_1",
      listId: "list_a",
      item: "Milk",
      foodId: "food_milk",
      quantity: 3,
      quantityMax: null,
      unit: "cup",
      optional: false,
      recipeId: null,
      list: { userId: user.id },
    });
    tx.query.shoppingLists.findFirst.mockResolvedValue(
      list("store", { isDefault: true }),
    );
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("store", { isDefault: true }),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([
      {
        id: "route_1",
        userId: user.id,
        foodId: "food_milk",
        normalizedItem: "milk",
        preferredListId: "store",
        packageAmount: null,
        packageUnit: null,
        packageLabel: null,
        packageRounding: null,
      },
    ]);
    tx.query.shoppingIngredientRouteAlternatives.findMany.mockResolvedValue([]);
    runWith(tx);

    await saveIngredientPackage(user, {
      itemId: "item_1",
      listId: "list_a",
      preferredListId: "store",
      packageAmount: 4.5,
      packageUnit: "cup",
      packageLabel: "Carton",
      packageRoundBehavior: "enable",
    });

    expect(tx.sets).toContainEqual(
      expect.objectContaining({
        preferredListId: "store",
        packageAmount: 4.5,
        packageRounding: true,
      }),
    );
    expect(tx.sets).toContainEqual(
      expect.objectContaining({
        quantity: 709.764,
        unit: "ml",
        requiredBaseQuantity: 709.764,
        requiredBaseQuantityMax: null,
        requiredBaseUnit: "ml",
        packageCount: 1,
        purchaseQuantity: 4.5,
        purchaseUnit: "cup",
        packageLabel: "Carton",
      }),
    );
  });
});

describe("list-scoped mutations", () => {
  it("clears checked and all items only from the authorized list", async () => {
    const checkedTx = fakeTx();
    checkedTx.query.shoppingLists.findFirst.mockResolvedValue(list("list_a"));
    runWith(checkedTx);
    await clearChecked(user, "list_a");

    const allTx = fakeTx();
    allTx.query.shoppingLists.findFirst.mockResolvedValue(list("list_b"));
    runWith(allTx);
    await clearList(user, "list_b");

    const dialect = new PgDialect();
    expect(
      checkedTx.wheres.map(
        (where) => dialect.sqlToQuery(where as never).params,
      ),
    ).toContainEqual(["list_a", true]);
    expect(
      allTx.wheres.map((where) => dialect.sqlToQuery(where as never).params),
    ).toContainEqual(["list_b"]);
    expect(checkedTx.selectChain.for).toHaveBeenCalledWith("update");
    expect(allTx.selectChain.for).toHaveBeenCalledWith("update");
  });

  it("unchecks all in the owned list without writing history", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findFirst.mockResolvedValue(list("list_a"));
    runWith(tx);

    await uncheckAll(user, "list_a");

    expect(tx.sets).toContainEqual(expect.objectContaining({ checked: false }));
    expect(
      tx.inserted.some((write) => write.table === shoppingListRestorePoints),
    ).toBe(false);
  });

  it("keeps normal checkbox toggles lightweight", async () => {
    const tx = fakeTx();
    tx.query.shoppingListItems.findFirst.mockResolvedValue({
      id: "item_1",
      listId: "list_a",
      list: { userId: user.id },
    });
    runWith(tx);

    await setItemChecked(user, "item_1", true);

    expect(tx.sets).toContainEqual({ checked: true });
    expect(
      tx.inserted.some((write) => write.table === shoppingListRestorePoints),
    ).toBe(false);
  });

  it("does not replace the default when archiving a non-default list", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findFirst.mockResolvedValue(list("list_b"));
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("list_a", { isDefault: true }),
      list("list_b"),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([]);
    runWith(tx);

    await expect(archiveShoppingList(user, "list_b")).resolves.toEqual({
      fallbackListId: "list_a",
    });

    expect(tx.sets).toHaveLength(1);
    expect(tx.sets[0]).toMatchObject({ isDefault: false });
    expect(tx.sets).not.toContainEqual({ isDefault: true });
  });

  it("promotes a default replacement but routes to the first active alternative", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findFirst.mockResolvedValue(
      list("default", { isDefault: true }),
    );
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("default", { isDefault: true }),
      list("fallback"),
      list("alternative"),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([
      {
        id: "route_1",
        userId: user.id,
        foodId: "food_milk",
        normalizedItem: "milk",
        preferredListId: "default",
      },
    ]);
    tx.query.shoppingIngredientRouteAlternatives.findMany.mockResolvedValue([
      { routeId: "route_1", listId: "alternative", position: 0 },
    ]);
    runWith(tx);

    await expect(archiveShoppingList(user, "default")).resolves.toEqual({
      fallbackListId: "fallback",
    });

    expect(tx.sets).toContainEqual({ isDefault: true });
    expect(tx.sets).toContainEqual(
      expect.objectContaining({ preferredListId: "alternative" }),
    );
  });
});

describe("automatic ingredient routing", () => {
  it("writes each recipe contribution to exactly one destination, never an alternative", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("default", { isDefault: true }),
      list("preferred"),
      list("alternative"),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([
      {
        id: "route_milk",
        userId: user.id,
        foodId: "food_milk",
        normalizedItem: "milk",
        preferredListId: "preferred",
        packageAmount: 500,
        packageUnit: "ml",
        packageLabel: "Carton",
        packageRounding: null,
      },
    ]);
    tx.query.userUnitPreferences.findFirst.mockResolvedValue({
      defaultSystem: "metric",
      volumeUnit: null,
      liquidVolumeUnit: null,
      dryVolumeUnit: null,
      smallVolumeUnit: null,
      massUnit: null,
      temperatureUnit: null,
      autoConvert: true,
      packageRounding: true,
    });
    tx.query.shoppingIngredientRouteAlternatives.findMany.mockResolvedValue([
      {
        routeId: "route_milk",
        listId: "alternative",
        position: 0,
      },
    ]);
    tx.query.shoppingListItems.findMany.mockResolvedValue([]);
    getRecipeMock.mockResolvedValue({
      id: "recipe_1",
      servings: 2,
      ingredients: [
        {
          item: "Milk",
          foodId: "food_milk",
          quantity: 1,
          quantityMax: null,
          unit: "cup",
          optional: false,
        },
        {
          item: "Bread",
          foodId: "food_bread",
          quantity: 1,
          quantityMax: null,
          unit: null,
          optional: false,
        },
      ],
    });
    runWith(tx);

    await addRecipeToList(user, "recipe_1");

    const rows = tx.inserted
      .filter((write) => write.table === shoppingListItems)
      .flatMap((write) => write.values as Array<Record<string, unknown>>);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          listId: "preferred",
          foodId: "food_milk",
          quantity: 236.588,
          unit: "ml",
          requiredBaseQuantity: 236.588,
          requiredBaseUnit: "ml",
          packageCount: 1,
          purchaseQuantity: 500,
          purchaseUnit: "ml",
          packageLabel: "Carton",
        }),
        expect.objectContaining({
          listId: "default",
          foodId: "food_bread",
        }),
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(rows).not.toContainEqual(
      expect.objectContaining({ listId: "alternative" }),
    );
  });

  it("rejects a saved preferred list that is not owned by the user", async () => {
    const tx = fakeTx();
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("default", { isDefault: true }),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([
      {
        id: "route_foreign",
        userId: user.id,
        foodId: "food_milk",
        normalizedItem: "milk",
        preferredListId: "foreign",
      },
    ]);
    tx.query.shoppingIngredientRouteAlternatives.findMany.mockResolvedValue([]);
    getRecipeMock.mockResolvedValue({
      id: "recipe_1",
      servings: 1,
      ingredients: [
        {
          item: "Milk",
          foodId: "food_milk",
          quantity: 1,
          quantityMax: null,
          unit: "cup",
          optional: false,
        },
      ],
    });
    runWith(tx);

    await expect(addRecipeToList(user, "recipe_1")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(
      tx.inserted.filter((write) => write.table === shoppingListItems),
    ).toHaveLength(0);
  });
});

describe("shopping restore points", () => {
  it("prunes beyond 20 deterministically in the snapshot transaction", async () => {
    const tx = fakeTx();
    tx.query.shoppingListRestorePoints.findMany.mockResolvedValue([
      { id: "old_2" },
      { id: "old_1" },
    ]);
    runWith(tx);

    await clearList(user, "list_a");

    const dialect = new PgDialect();
    const historyOptions = tx.query.shoppingListRestorePoints.findMany.mock
      .calls[0]?.[0] as unknown as { offset: number; orderBy: unknown[] };
    expect(historyOptions.offset).toBe(20);
    expect(
      historyOptions.orderBy.map(
        (order) => dialect.sqlToQuery(order as never).sql,
      ),
    ).toEqual([
      '"shopping_list_restore_points"."createdAt" desc',
      '"shopping_list_restore_points"."id" desc',
    ]);
    expect(
      tx.wheres.map((where) => dialect.sqlToQuery(where as never).params),
    ).toContainEqual(["list_a", user.id, "old_2", "old_1"]);
  });

  it("verifies ownership in the row-lock query before snapshotting", async () => {
    const tx = fakeTx();
    tx.lockResults.push([]);
    runWith(tx);

    await expect(clearChecked(user, "foreign")).rejects.toThrow("NOT_FOUND");
    expect(tx.selectChain.for).toHaveBeenCalledWith("update");
    expect(
      tx.inserted.some((write) => write.table === shoppingListRestorePoints),
    ).toBe(false);
  });

  it("restores snapshot items after recording the current state", async () => {
    const tx = fakeTx();
    tx.query.shoppingListItems.findMany.mockResolvedValue([
      {
        id: "current",
        item: "Current milk",
        quantity: 1,
        quantityMax: null,
        unit: "carton",
        category: "Dairy",
        note: null,
        optional: false,
        checked: false,
        recipeId: null,
        foodId: null,
        position: 9,
      },
    ]);
    tx.query.shoppingListRestorePoints.findFirst.mockResolvedValue({
      id: "point_1",
      listId: "list_a",
      userId: user.id,
      operation: "clear_all",
      createdAt: new Date(),
      items: [
        {
          id: "snapshot_item",
          restorePointId: "point_1",
          item: "Earlier bread",
          quantity: 2,
          quantityMax: null,
          unit: null,
          category: "Bakery",
          note: null,
          optional: false,
          checked: true,
          recipeId: null,
          foodId: null,
          position: 4,
        },
      ],
    });
    runWith(tx);

    await expect(
      restoreShoppingListPoint(user, "list_a", "point_1"),
    ).resolves.toEqual({
      listId: "list_a",
      restorePointId: "restore_1",
    });

    expect(
      tx.inserted.find((write) => write.table === shoppingListRestorePoints)
        ?.values,
    ).toMatchObject({ operation: "restore", listId: "list_a" });
    expect(
      tx.inserted.find((write) => write.table === shoppingListRestorePointItems)
        ?.values,
    ).toEqual([expect.objectContaining({ item: "Current milk", position: 0 })]);
    expect(
      tx.inserted.filter((write) => write.table === shoppingListItems).at(-1)
        ?.values,
    ).toEqual([
      expect.objectContaining({ item: "Earlier bread", position: 0 }),
    ]);
    expect(tx.delete).not.toHaveBeenCalledWith(shoppingListRestorePoints);
  });

  it("cannot restore a foreign or stale point for an owned list", async () => {
    const tx = fakeTx();
    tx.query.shoppingListRestorePoints.findFirst.mockResolvedValue(undefined);
    runWith(tx);

    await expect(
      restoreShoppingListPoint(user, "list_a", "foreign_point"),
    ).rejects.toThrow("NOT_FOUND");
    const pointQuery = tx.query.shoppingListRestorePoints.findFirst.mock
      .calls[0]?.[0] as { where: unknown };
    expect(
      new PgDialect().sqlToQuery(pointQuery.where as never).params,
    ).toEqual(["foreign_point", "list_a", user.id]);
    expect(
      tx.inserted.some((write) => write.table === shoppingListRestorePoints),
    ).toBe(false);
  });

  it("snapshots source and destination lists once for a bulk move", async () => {
    const tx = fakeTx();
    const itemA = {
      id: "item_a",
      listId: "list_a",
      item: "Milk",
      foodId: null,
      quantity: 1,
      quantityMax: null,
      unit: null,
      category: "Dairy",
      note: null,
      optional: false,
      checked: false,
      recipeId: null,
      list: { userId: user.id },
    };
    const itemB = { ...itemA, id: "item_b", listId: "list_b", item: "Bread" };
    tx.query.shoppingListItems.findFirst
      .mockResolvedValueOnce(itemA)
      .mockResolvedValueOnce(itemB)
      .mockResolvedValueOnce(itemA)
      .mockResolvedValueOnce(itemB);
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("list_a"),
      list("list_b"),
      list("list_c", { isDefault: true }),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([]);
    tx.query.shoppingIngredientRouteAlternatives.findMany.mockResolvedValue([]);
    runWith(tx);

    const result = await bulkMoveShoppingItems(user, {
      itemIds: ["item_a", "item_b"],
      targetListId: "list_c",
    });

    expect(result.restorePoints.map((point) => point.listId)).toEqual([
      "list_a",
      "list_b",
      "list_c",
    ]);
    expect(
      tx.inserted
        .filter((write) => write.table === shoppingListRestorePoints)
        .map((write) => (write.values as { operation: string }).operation),
    ).toEqual([
      "bulk_move_source",
      "bulk_move_source",
      "bulk_move_destination",
    ]);
    expect(result.undoToken).toEqual({
      restorePoints: result.restorePoints,
    });
  });

  it("atomically restores every list in a bulk undo token", async () => {
    const tx = fakeTx();
    const snapshotItem = (item: string) => ({
      id: `snapshot_${item}`,
      restorePointId: `point_${item}`,
      item,
      quantity: 1,
      quantityMax: null,
      unit: null,
      category: "Other",
      note: null,
      optional: false,
      checked: false,
      recipeId: null,
      foodId: null,
      position: 0,
    });
    tx.query.shoppingListRestorePoints.findFirst
      .mockResolvedValueOnce({
        id: "source_point",
        operation: "bulk_move_source",
        items: [snapshotItem("Source milk")],
      })
      .mockResolvedValueOnce({
        id: "target_point",
        operation: "bulk_move_destination",
        items: [snapshotItem("Target bread")],
      });
    runWith(tx);

    const result = await restoreShoppingListPoints(user, {
      restorePoints: [
        { listId: "list_a", restorePointId: "source_point" },
        { listId: "list_c", restorePointId: "target_point" },
      ],
    });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(tx.selectChain.for).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      restorePoints: [
        { listId: "list_a", restorePointId: "restore_1" },
        { listId: "list_c", restorePointId: "restore_2" },
      ],
      undoToken: {
        restorePoints: [
          { listId: "list_a", restorePointId: "restore_1" },
          { listId: "list_c", restorePointId: "restore_2" },
        ],
      },
    });
    expect(
      tx.inserted
        .filter((write) => write.table === shoppingListItems)
        .map((write) =>
          (write.values as Array<{ item: string }>).map((item) => item.item),
        ),
    ).toEqual([["Source milk"], ["Target bread"]]);
    const dialect = new PgDialect();
    expect(
      tx.wheres.map((where) => dialect.sqlToQuery(where as never).params),
    ).toEqual(expect.arrayContaining([["list_a"], ["list_c"]]));
  });

  it("aborts a multi-restore before writes when any point is unauthorized", async () => {
    const tx = fakeTx();
    tx.query.shoppingListRestorePoints.findFirst
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(undefined);
    runWith(tx);

    await expect(
      restoreShoppingListPoints(user, {
        restorePoints: [
          { listId: "list_a", restorePointId: "source_point" },
          { listId: "list_c", restorePointId: "foreign_point" },
        ],
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(
      tx.inserted.some((write) => write.table === shoppingListRestorePoints),
    ).toBe(false);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("captures each affected list before a meal-plan rebuild", async () => {
    const tx = fakeTx();
    mealPlanEntriesMock.mockResolvedValue([
      {
        recipeId: "recipe_1",
        note: null,
        servingsMade: 2,
        leftoverSourceId: null,
        recipe: {
          id: "recipe_1",
          servings: 2,
          ingredients: [
            {
              item: "Milk",
              foodId: null,
              quantity: 1,
              quantityMax: null,
              unit: "cup",
              optional: false,
            },
          ],
        },
      },
    ]);
    tx.query.shoppingLists.findMany.mockResolvedValue([
      list("default", { isDefault: true }),
    ]);
    tx.query.shoppingIngredientRoutes.findMany.mockResolvedValue([]);
    runWith(tx);

    const result = await buildListFromPlan(user, "2026-08-03", "2026-08-09");

    expect(result.restorePoints).toEqual([
      { listId: "default", restorePointId: "restore_1" },
    ]);
    expect(
      tx.inserted.find((write) => write.table === shoppingListRestorePoints)
        ?.values,
    ).toMatchObject({ listId: "default", operation: "rebuild" });
  });
});
