import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

import {
  customUnits,
  shoppingIngredientRoutes,
  shoppingListItems,
  type ShoppingListItem,
  type User,
} from "~/server/db/schema";
import {
  createCustomUnit,
  deleteCustomUnit,
  updateCustomUnit,
} from "./mutations";

const user = { id: "user_1" } as User;
const oldUnit = {
  id: "unit_1",
  userId: user.id,
  name: "scoop",
  abbreviation: "scp",
  dimension: "volume" as const,
  baseUnit: "cup",
  baseAmount: 0.5,
  displayAsTrue: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};
const legacyItem: ShoppingListItem = {
  id: "item_1",
  listId: "list_1",
  item: "Flour",
  foodId: null,
  quantity: 2,
  quantityMax: null,
  unit: "scoop",
  requiredBaseQuantity: null,
  requiredBaseQuantityMax: null,
  requiredBaseUnit: null,
  purchaseQuantity: null,
  purchaseUnit: null,
  packageCount: null,
  packageAmount: null,
  packageUnit: null,
  packageLabel: null,
  category: "Pantry",
  note: null,
  optional: false,
  checked: false,
  recipeId: null,
  position: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function fakeTx(
  remainingUnits: unknown[],
  shoppingRows: ShoppingListItem[] = [legacyItem],
  routeRows: Array<Record<string, unknown>> = [],
) {
  const operations: Array<{ table: unknown; values?: unknown }> = [];
  const joins: unknown[] = [];
  const selectWheres: unknown[] = [];
  const writeWheres: unknown[] = [];
  const routeFindWheres: unknown[] = [];
  let current: { table: unknown; values?: unknown };
  const writeChain = {
    set: vi.fn((values: unknown) => {
      current.values = values;
      if (current.table === shoppingIngredientRoutes) {
        const route = routeRows[0];
        if (route) Object.assign(route, values);
      }
      return writeChain;
    }),
    where: vi.fn((condition: unknown) => {
      writeWheres.push(condition);
      return writeChain;
    }),
    returning: vi.fn(async () => [{ id: "unit_1" }]),
  };
  const selectChain = {
    from: vi.fn(() => selectChain),
    innerJoin: vi.fn((_table: unknown, condition: unknown) => {
      joins.push(condition);
      return selectChain;
    }),
    where: vi.fn(async (condition: unknown) => {
      selectWheres.push(condition);
      return shoppingRows.map((item) => ({ item }));
    }),
  };
  const tx = {
    operations,
    joins,
    selectWheres,
    writeWheres,
    routeFindWheres,
    query: {
      customUnits: {
        findFirst: vi.fn().mockResolvedValue(oldUnit),
        findMany: vi.fn().mockResolvedValue(remainingUnits),
      },
      userUnitPreferences: {
        findFirst: vi.fn().mockResolvedValue({
          defaultSystem: "metric",
          volumeUnit: "scoop",
          liquidVolumeUnit: null,
          dryVolumeUnit: "scoop",
          smallVolumeUnit: null,
          massUnit: null,
          temperatureUnit: null,
          autoConvert: true,
          packageRounding: false,
        }),
      },
      shoppingIngredientRoutes: {
        findMany: vi
          .fn()
          .mockImplementation(async (config?: { where?: unknown }) => {
            routeFindWheres.push(config?.where);
            return routeRows;
          }),
      },
    },
    select: vi.fn(() => selectChain),
    insert: vi.fn((table: unknown) => {
      current = { table };
      operations.push(current);
      return {
        values: vi.fn((values: unknown) => {
          current.values = values;
          return {
            returning: vi.fn(async () => [oldUnit]),
          };
        }),
      };
    }),
    update: vi.fn((table: unknown) => {
      current = { table };
      operations.push(current);
      return writeChain;
    }),
    delete: vi.fn((table: unknown) => {
      current = { table };
      operations.push(current);
      return writeChain;
    }),
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

describe("custom-unit shopping quantity preservation", () => {
  it("canonicalizes an unknown persisted unit when its definition is created", async () => {
    const unknownItem = {
      ...legacyItem,
      requiredBaseQuantity: 2,
      requiredBaseUnit: "scoop",
    };
    const tx = fakeTx([oldUnit], [unknownItem]);
    runWith(tx);

    await createCustomUnit(
      {
        name: "scoop",
        abbreviation: "scp",
        dimension: "volume",
        baseUnit: "cup",
        baseAmount: 0.5,
        displayAsTrue: false,
      },
      user,
    );

    expect(tx.operations.map((operation) => operation.table)).toEqual([
      customUnits,
      shoppingListItems,
      shoppingListItems,
    ]);
    expect(tx.operations[1]?.values).toMatchObject({
      requiredBaseQuantity: 236.588,
      requiredBaseUnit: "ml",
    });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(tx.joins[0] as never).params).toContain(user.id);
  });

  it("rejects an update by a non-owner before touching shopping rows", async () => {
    const tx = fakeTx([]);
    tx.query.customUnits.findFirst.mockResolvedValue(null);
    runWith(tx);

    await expect(
      updateCustomUnit(
        oldUnit.id,
        {
          name: "scoop",
          abbreviation: "scp",
          dimension: "volume",
          baseUnit: "cup",
          baseAmount: 1,
          displayAsTrue: false,
        },
        user,
      ),
    ).rejects.toThrow("NOT_FOUND");
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("canonicalizes with the old definition before an authorized update", async () => {
    const updatedUnit = { ...oldUnit, baseAmount: 1 };
    const persistedCustomItem = {
      ...legacyItem,
      requiredBaseQuantity: 2,
      requiredBaseUnit: "scoop",
    };
    const tx = fakeTx([updatedUnit], [persistedCustomItem]);
    runWith(tx);

    await updateCustomUnit(
      oldUnit.id,
      {
        name: "scoop",
        abbreviation: "scp",
        dimension: "volume",
        baseUnit: "cup",
        baseAmount: 1,
        displayAsTrue: false,
      },
      user,
    );

    expect(tx.operations.map((operation) => operation.table)).toEqual([
      shoppingListItems,
      customUnits,
      shoppingListItems,
    ]);
    expect(tx.operations[0]?.values).toMatchObject({
      requiredBaseQuantity: 236.588,
      requiredBaseQuantityMax: null,
      requiredBaseUnit: "ml",
    });
    expect(tx.operations[2]?.values).toMatchObject({
      quantity: 1,
      unit: "scoop",
      requiredBaseQuantity: 236.588,
      requiredBaseUnit: "ml",
    });

    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(tx.joins[0] as never).params).toContain(user.id);
    expect(dialect.sqlToQuery(tx.selectWheres[0] as never).params).toEqual([
      "scoop",
      "scp",
      "scoop",
      "scp",
    ]);
  });

  it("matches an old abbreviation before deletion and preserves its quantity", async () => {
    const abbreviatedItem = {
      ...legacyItem,
      unit: "scp",
      requiredBaseQuantity: 3,
      requiredBaseUnit: "SCP",
    };
    const tx = fakeTx([], [abbreviatedItem]);
    runWith(tx);
    await deleteCustomUnit(oldUnit.id, user);

    expect(tx.operations.map((operation) => operation.table)).toEqual([
      shoppingListItems,
      customUnits,
      shoppingListItems,
    ]);
    expect(tx.operations[0]?.values).toMatchObject({
      requiredBaseQuantity: 354.882,
      requiredBaseUnit: "ml",
    });
    expect(tx.operations[2]?.values).toMatchObject({
      quantity: 354.882,
      unit: "ml",
      requiredBaseQuantity: 354.882,
      requiredBaseUnit: "ml",
    });
  });

  it("rejects deletion by a non-owner without touching foreign shopping rows", async () => {
    const foreignTx = fakeTx([]);
    foreignTx.query.customUnits.findFirst.mockResolvedValue(null);
    runWith(foreignTx);

    await expect(deleteCustomUnit(oldUnit.id, user)).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(foreignTx.select).not.toHaveBeenCalled();
    expect(foreignTx.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["name", "bottle"],
    ["abbreviation", "btl"],
  ])(
    "normalizes a previously unknown package route matched by %s on creation",
    async (_match, packageUnit) => {
      const route = {
        id: "route_1",
        userId: user.id,
        foodId: "juice",
        normalizedItem: "juice",
        displayItem: "Juice",
        preferredListId: "list_1",
        packageAmount: 1,
        packageUnit,
        packageLabel: "glass bottle",
        packageRounding: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };
      const juice = {
        ...legacyItem,
        item: "Juice",
        foodId: "juice",
        quantity: 1,
        unit: "l",
        requiredBaseQuantity: 1000,
        requiredBaseUnit: "ml",
      };
      const tx = fakeTx([oldUnit], [juice], [route]);
      tx.insert.mockImplementation((table: unknown) => {
        const operationRecord: { table: unknown; values?: unknown } = { table };
        tx.operations.push(operationRecord);
        return {
          values: vi.fn((values: Record<string, unknown>) => {
            operationRecord.values = values;
            return {
              returning: vi.fn(async () => [
                {
                  ...oldUnit,
                  ...values,
                  id: "unit_1",
                  userId: user.id,
                },
              ]),
            };
          }),
        };
      });
      runWith(tx);

      await createCustomUnit(
        {
          name: "bottle",
          abbreviation: "btl",
          dimension: "volume",
          baseUnit: "ml",
          baseAmount: 750,
          displayAsTrue: true,
        },
        user,
      );

      expect(route).toMatchObject({
        packageAmount: 750,
        packageUnit: "ml",
        packageLabel: "glass bottle",
        packageRounding: true,
        preferredListId: "list_1",
      });
      const itemWrites = tx.operations.filter(
        (operation) => operation.table === shoppingListItems,
      );
      expect(itemWrites.at(-1)?.values).toMatchObject({
        requiredBaseQuantity: 1000,
        packageCount: 2,
        purchaseQuantity: 1500,
        purchaseUnit: "ml",
      });
      const dialect = new PgDialect();
      const routeLookup = tx.routeFindWheres[0];
      expect(dialect.sqlToQuery(routeLookup as never).params).toContain(
        user.id,
      );
      const routeWrite = tx.operations.find(
        (operation) => operation.table === shoppingIngredientRoutes,
      );
      expect(routeWrite?.values).toEqual(
        expect.objectContaining({ packageAmount: 750, packageUnit: "ml" }),
      );
      expect(
        tx.writeWheres.some((where) =>
          dialect.sqlToQuery(where as never).params.includes(user.id),
        ),
      ).toBe(true);
    },
  );

  it.each([
    ["rename/update", "update"],
    ["delete", "delete"],
  ])(
    "keeps a canonical 750 ml package route stable through %s",
    async (_label, operation) => {
      const route = {
        id: "route_1",
        userId: user.id,
        foodId: "juice",
        normalizedItem: "juice",
        displayItem: "Juice",
        preferredListId: "list_1",
        packageAmount: 1,
        packageUnit: "btl",
        packageLabel: "glass bottle",
        packageRounding: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };
      const juice = {
        ...legacyItem,
        item: "Juice",
        foodId: "juice",
        quantity: 1,
        unit: "l",
        requiredBaseQuantity: 1000,
        requiredBaseUnit: "ml",
      };
      const tx = fakeTx(
        operation === "update" ? [{ ...oldUnit }] : [],
        [juice],
        [route],
      );
      tx.query.customUnits.findFirst.mockResolvedValue({
        ...oldUnit,
        name: "bottle",
        abbreviation: "btl",
        baseUnit: "ml",
        baseAmount: 750,
      });
      runWith(tx);

      if (operation === "update") {
        await updateCustomUnit(
          oldUnit.id,
          {
            name: "flask",
            abbreviation: "fl",
            dimension: "volume",
            baseUnit: "l",
            baseAmount: 1,
            displayAsTrue: false,
          },
          user,
        );
      } else {
        await deleteCustomUnit(oldUnit.id, user);
      }

      expect(route).toMatchObject({
        packageAmount: 750,
        packageUnit: "ml",
        packageLabel: "glass bottle",
        packageRounding: true,
        preferredListId: "list_1",
      });
      const itemWrites = tx.operations.filter(
        (candidate) => candidate.table === shoppingListItems,
      );
      expect(itemWrites.at(-1)?.values).toMatchObject({
        requiredBaseQuantity: 1000,
        packageCount: 2,
        purchaseQuantity: 1500,
        purchaseUnit: "ml",
      });
    },
  );
});
