import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      shoppingLists: { findMany: vi.fn() },
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
import { getShoppingWorkspace } from "./queries";

const user = { id: "user_1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.shoppingIngredientRoutes.findMany.mockResolvedValue([]);
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
