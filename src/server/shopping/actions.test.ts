import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireUserMock,
  archiveListMock,
  deleteListMock,
  makeDefaultMock,
  moveItemMock,
  clearCheckedMock,
  uncheckAllMock,
  restorePointMock,
  historyMock,
  bulkMoveMock,
  multiRestoreMock,
  savePackageMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  archiveListMock: vi.fn(),
  deleteListMock: vi.fn(),
  makeDefaultMock: vi.fn(),
  moveItemMock: vi.fn(),
  clearCheckedMock: vi.fn(),
  uncheckAllMock: vi.fn(),
  restorePointMock: vi.fn(),
  historyMock: vi.fn(),
  bulkMoveMock: vi.fn(),
  multiRestoreMock: vi.fn(),
  savePackageMock: vi.fn(),
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
  bulkMoveShoppingItems: bulkMoveMock,
  clearChecked: clearCheckedMock,
  clearList: vi.fn(),
  createShoppingList: vi.fn(),
  deleteShoppingList: deleteListMock,
  makeShoppingListDefault: makeDefaultMock,
  moveShoppingItem: moveItemMock,
  removeItem: vi.fn(),
  renameShoppingList: vi.fn(),
  restoreShoppingList: vi.fn(),
  restoreShoppingListPoint: restorePointMock,
  restoreShoppingListPoints: multiRestoreMock,
  saveIngredientPackage: savePackageMock,
  setItemCategory: vi.fn(),
  setItemChecked: vi.fn(),
  uncheckAll: uncheckAllMock,
}));
vi.mock("./queries", () => ({
  getShoppingListHistory: historyMock,
}));

import {
  archiveShoppingListAction,
  bulkMoveShoppingItemsAction,
  clearCheckedItemsAction,
  deleteShoppingListAction,
  getShoppingListHistoryAction,
  makeShoppingListDefaultAction,
  moveShoppingItemAction,
  restoreShoppingListPointAction,
  restoreShoppingListPointsAction,
  uncheckAllShoppingItemsAction,
  saveIngredientPackageAction,
} from "./actions";

const id = (suffix: string) => `${"a".repeat(23)}${suffix}`;

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1" });
});

describe("shopping list actions", () => {
  it("validates route alternatives before invoking the mutation", async () => {
    const result = await moveShoppingItemAction({
      itemId: id("1"),
      targetListId: id("2"),
      rememberRoute: true,
      alternativeListIds: [id("3"), id("3")],
    });

    expect(result.ok).toBe(false);
    expect(moveItemMock).not.toHaveBeenCalled();
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("validates bulk item ids and returns both lists' undo points", async () => {
    await expect(
      bulkMoveShoppingItemsAction({
        itemIds: [id("1"), id("1")],
        targetListId: id("2"),
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(bulkMoveMock).not.toHaveBeenCalled();

    const restorePoints = [
      { listId: id("3"), restorePointId: id("4") },
      { listId: id("2"), restorePointId: id("5") },
    ];
    const undoToken = { restorePoints };
    bulkMoveMock.mockResolvedValue({ restorePoints, undoToken });
    await expect(
      bulkMoveShoppingItemsAction({
        itemIds: [id("1")],
        targetListId: id("2"),
      }),
    ).resolves.toEqual({ ok: true, restorePoints, undoToken });
  });

  it("restores a bulk undo token through one server action", async () => {
    const restorePoints = [
      { listId: id("1"), restorePointId: id("3") },
      { listId: id("2"), restorePointId: id("4") },
    ];
    const redoPoints = [
      { listId: id("1"), restorePointId: id("5") },
      { listId: id("2"), restorePointId: id("6") },
    ];
    multiRestoreMock.mockResolvedValue({
      restorePoints: redoPoints,
      undoToken: { restorePoints: redoPoints },
    });

    await expect(
      restoreShoppingListPointsAction({ restorePoints }),
    ).resolves.toEqual({
      ok: true,
      restorePoints: redoPoints,
      undoToken: { restorePoints: redoPoints },
    });
    expect(multiRestoreMock).toHaveBeenCalledOnce();
    expect(multiRestoreMock).toHaveBeenCalledWith(
      { id: "user_1" },
      { restorePoints },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/shopping");
  });

  it("maps foreign list ids to the standard not-found action result", async () => {
    makeDefaultMock.mockRejectedValue(new Error("NOT_FOUND"));

    await expect(
      makeShoppingListDefaultAction({ listId: id("1") }),
    ).resolves.toEqual({ ok: false, error: "We couldn't find that item." });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates shopping after an authorized default change", async () => {
    makeDefaultMock.mockResolvedValue({ defaultListId: id("2") });

    await expect(
      makeShoppingListDefaultAction({ listId: id("2") }),
    ).resolves.toEqual({ ok: true, defaultListId: id("2") });
    expect(makeDefaultMock).toHaveBeenCalledWith({ id: "user_1" }, id("2"));
    expect(revalidatePathMock).toHaveBeenCalledWith("/shopping");
  });

  it("returns the server-selected fallback after archiving", async () => {
    archiveListMock.mockResolvedValue({ fallbackListId: "default" });

    await expect(
      archiveShoppingListAction({ listId: id("1") }),
    ).resolves.toEqual({ ok: true, fallbackListId: "default" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/shopping");
  });

  it("returns the server-selected fallback after deletion", async () => {
    deleteListMock.mockResolvedValue({ fallbackListId: "default" });

    await expect(
      deleteShoppingListAction({ listId: id("1") }),
    ).resolves.toEqual({ ok: true, fallbackListId: "default" });
  });

  it("returns an immediate undo id for remove-completed", async () => {
    clearCheckedMock.mockResolvedValue({ restorePointId: id("3") });

    await expect(clearCheckedItemsAction({ listId: id("1") })).resolves.toEqual(
      { ok: true, restorePointId: id("3") },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/shopping");
  });

  it("unchecks all without creating a restore point", async () => {
    uncheckAllMock.mockResolvedValue(undefined);

    await expect(
      uncheckAllShoppingItemsAction({ listId: id("1") }),
    ).resolves.toEqual({ ok: true });
    expect(clearCheckedMock).not.toHaveBeenCalled();
    expect(restorePointMock).not.toHaveBeenCalled();
  });

  it("restores an owned point and returns the new current-state undo id", async () => {
    restorePointMock.mockResolvedValue({
      listId: id("1"),
      restorePointId: id("3"),
    });

    await expect(
      restoreShoppingListPointAction({
        listId: id("1"),
        restorePointId: id("2"),
      }),
    ).resolves.toEqual({ ok: true, restorePointId: id("3") });
    expect(restorePointMock).toHaveBeenCalledWith(
      { id: "user_1" },
      id("1"),
      id("2"),
    );
  });

  it("retrieves authorized history without revalidating", async () => {
    historyMock.mockResolvedValue([]);

    await expect(
      getShoppingListHistoryAction({ listId: id("1") }),
    ).resolves.toEqual({ ok: true, history: [] });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("validates and forwards package preferences for the authenticated user", async () => {
    await expect(
      saveIngredientPackageAction({
        itemId: id("1"),
        listId: id("2"),
        preferredListId: id("3"),
        packageAmount: 4.5,
        packageUnit: "cup",
        packageLabel: "Carton",
        packageRoundBehavior: "enable",
      }),
    ).resolves.toEqual({ ok: true });
    expect(savePackageMock).toHaveBeenCalledWith(
      { id: "user_1" },
      expect.objectContaining({
        itemId: id("1"),
        listId: id("2"),
        preferredListId: id("3"),
        packageRoundBehavior: "enable",
      }),
    );
  });
});
