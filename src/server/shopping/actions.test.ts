import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireUserMock,
  archiveListMock,
  deleteListMock,
  makeDefaultMock,
  moveItemMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  archiveListMock: vi.fn(),
  deleteListMock: vi.fn(),
  makeDefaultMock: vi.fn(),
  moveItemMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn() }));
vi.mock("~/server/auth", () => ({ requireUser: requireUserMock }));
vi.mock("~/server/db", () => ({ isDbConfigured: () => true }));
vi.mock("./mutations", () => ({
  addManualItem: vi.fn(),
  addRecipeToList: vi.fn(),
  archiveShoppingList: archiveListMock,
  buildListFromPlan: vi.fn(),
  clearChecked: vi.fn(),
  clearList: vi.fn(),
  createShoppingList: vi.fn(),
  deleteShoppingList: deleteListMock,
  makeShoppingListDefault: makeDefaultMock,
  moveShoppingItem: moveItemMock,
  removeItem: vi.fn(),
  renameShoppingList: vi.fn(),
  restoreShoppingList: vi.fn(),
  setItemCategory: vi.fn(),
  setItemChecked: vi.fn(),
}));

import {
  archiveShoppingListAction,
  deleteShoppingListAction,
  makeShoppingListDefaultAction,
  moveShoppingItemAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1" });
});

describe("shopping list actions", () => {
  it("validates route alternatives before invoking the mutation", async () => {
    const result = await moveShoppingItemAction({
      itemId: "item_1",
      targetListId: "list_2",
      rememberRoute: true,
      alternativeListIds: ["list_1", "list_1"],
    });

    expect(result.ok).toBe(false);
    expect(moveItemMock).not.toHaveBeenCalled();
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("maps foreign list ids to the standard not-found action result", async () => {
    makeDefaultMock.mockRejectedValue(new Error("NOT_FOUND"));

    await expect(
      makeShoppingListDefaultAction({ listId: "foreign" }),
    ).resolves.toEqual({ ok: false, error: "We couldn't find that item." });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates shopping after an authorized default change", async () => {
    makeDefaultMock.mockResolvedValue({ defaultListId: "list_2" });

    await expect(
      makeShoppingListDefaultAction({ listId: "list_2" }),
    ).resolves.toEqual({ ok: true, defaultListId: "list_2" });
    expect(makeDefaultMock).toHaveBeenCalledWith({ id: "user_1" }, "list_2");
    expect(revalidatePathMock).toHaveBeenCalledWith("/shopping");
  });

  it("returns the server-selected fallback after archiving", async () => {
    archiveListMock.mockResolvedValue({ fallbackListId: "default" });

    await expect(
      archiveShoppingListAction({ listId: "selected" }),
    ).resolves.toEqual({ ok: true, fallbackListId: "default" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/shopping");
  });

  it("returns the server-selected fallback after deletion", async () => {
    deleteListMock.mockResolvedValue({ fallbackListId: "default" });

    await expect(
      deleteShoppingListAction({ listId: "selected" }),
    ).resolves.toEqual({ ok: true, fallbackListId: "default" });
  });
});
