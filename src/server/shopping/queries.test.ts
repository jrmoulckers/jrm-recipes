import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      shoppingLists: { findFirst: vi.fn(), findMany: vi.fn() },
      shoppingListRestorePoints: { findMany: vi.fn() },
      shoppingIngredientRoutes: { findMany: vi.fn() },
      shoppingIngredientRouteAlternatives: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { type User } from "~/server/db/schema";
import {
  getShoppingListHistory,
  getShoppingWorkspace,
  SHOPPING_HISTORY_LIMIT,
} from "./queries";

const user = { id: "user_1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.shoppingIngredientRoutes.findMany.mockResolvedValue([]);
});

describe("getShoppingListHistory", () => {
  it("rejects a foreign list before reading its snapshots", async () => {
    dbMock.query.shoppingLists.findFirst.mockResolvedValue(undefined);

    await expect(getShoppingListHistory(user, "foreign")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(
      dbMock.query.shoppingListRestorePoints.findMany,
    ).not.toHaveBeenCalled();
  });

  it("returns at most 20 recent points with preview items", async () => {
    dbMock.query.shoppingLists.findFirst.mockResolvedValue({ id: "list_1" });
    dbMock.query.shoppingListRestorePoints.findMany.mockResolvedValue([
      {
        id: "point_1",
        listId: "list_1",
        operation: "remove_completed",
        items: [{ item: "Milk", position: 0 }],
      },
    ]);

    await expect(getShoppingListHistory(user, "list_1")).resolves.toEqual([
      {
        id: "point_1",
        listId: "list_1",
        operation: "remove-completed",
        items: [{ item: "Milk", position: 0 }],
        restorePoints: [{ listId: "list_1", restorePointId: "point_1" }],
      },
    ]);
    const options = dbMock.query.shoppingListRestorePoints.findMany.mock
      .calls[0]?.[0] as unknown as {
      limit: number;
      orderBy: unknown[];
      with: { items: { orderBy: unknown[] } };
    };
    expect(options.limit).toBe(SHOPPING_HISTORY_LIMIT);
    expect(options.orderBy).toHaveLength(2);
    expect(options.with.items.orderBy).toHaveLength(2);
  });

  it("links every list snapshot in one grouped operation", async () => {
    dbMock.query.shoppingLists.findFirst.mockResolvedValue({ id: "source" });
    dbMock.query.shoppingListRestorePoints.findMany
      .mockResolvedValueOnce([
        {
          id: "source_point",
          listId: "source",
          operation: "bulk_move_source",
          operationGroupId: "group_1",
          items: [{ item: "Milk", position: 0 }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "destination_point",
          listId: "destination",
          operationGroupId: "group_1",
        },
        {
          id: "source_point",
          listId: "source",
          operationGroupId: "group_1",
        },
      ]);

    const history = await getShoppingListHistory(user, "source");

    expect(history?.[0]?.restorePoints).toEqual([
      {
        listId: "destination",
        restorePointId: "destination_point",
      },
      { listId: "source", restorePointId: "source_point" },
    ]);
  });
});

describe("getShoppingWorkspace list selection", () => {
  it("keeps explicit URL selection independent from the saved default", async () => {
    dbMock.query.shoppingLists.findMany.mockResolvedValue([
      {
        id: "default",
        userId: user.id,
        name: "Default",
        isDefault: true,
        archivedAt: null,
        items: [],
      },
      {
        id: "viewed",
        userId: user.id,
        name: "Viewed",
        isDefault: false,
        archivedAt: null,
        items: [],
      },
    ]);

    const workspace = await getShoppingWorkspace(user, "viewed");

    expect(workspace?.selectedListId).toBe("viewed");
    expect(workspace?.defaultListId).toBe("default");
  });
});
