import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

const { transactionMock, getRecipeMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  getRecipeMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      groupMembers: { findFirst: vi.fn() },
      mealPlanEntries: { findMany: vi.fn() },
    },
  },
}));
vi.mock("~/server/recipes/queries", () => ({ getRecipe: getRecipeMock }));
vi.mock("~/server/dietary/gating", () => ({
  planWarningsForRecipes: vi.fn(async () => new Map()),
}));

import { shoppingListItems, type User } from "~/server/db/schema";
import {
  addRecipeToList,
  archiveShoppingList,
  clearChecked,
  clearList,
  moveShoppingItem,
  renameShoppingList,
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
  let currentTable: unknown;
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
    returning: vi.fn(async () => [{ id: "created_1" }]),
  };
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(async () => [{ next: 0 }]),
  };
  const tx = {
    inserted,
    sets,
    wheres,
    query: {
      shoppingLists: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      shoppingListItems: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      shoppingIngredientRoutes: {
        findMany: vi.fn(),
      },
      shoppingIngredientRouteAlternatives: {
        findMany: vi.fn(),
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
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.update).not.toHaveBeenCalled();
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
    foreignTargetTx.query.shoppingLists.findFirst.mockResolvedValue(
      list("list_b", { userId: "user_2" }),
    );
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
    foreignAlternativeTx.query.shoppingLists.findFirst
      .mockResolvedValueOnce(list("list_b"))
      .mockResolvedValueOnce(list("list_c", { userId: "user_2" }));
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
    expect(dialect.sqlToQuery(checkedTx.wheres.at(-1) as never).params).toEqual(
      ["list_a", true],
    );
    expect(dialect.sqlToQuery(allTx.wheres.at(-1) as never).params).toEqual([
      "list_b",
    ]);
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
      },
    ]);
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
