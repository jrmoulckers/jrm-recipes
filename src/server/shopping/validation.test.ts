import { describe, expect, it } from "vitest";

import {
  createShoppingListInput,
  manualItemInput,
  moveShoppingItemInput,
} from "./validation";

describe("shopping list validation", () => {
  it("requires an explicit list for manual items", () => {
    expect(manualItemInput.safeParse({ item: "Milk" }).success).toBe(false);
    expect(
      manualItemInput.safeParse({ listId: "list_1", item: "Milk" }).success,
    ).toBe(true);
  });

  it("trims list and optional store names", () => {
    expect(
      createShoppingListInput.parse({
        name: "  Warehouse  ",
        storeName: "  Costco  ",
      }),
    ).toEqual({ name: "Warehouse", storeName: "Costco" });
  });

  it("rejects duplicate alternatives and the preferred list as an alternative", () => {
    expect(
      moveShoppingItemInput.safeParse({
        itemId: "item_1",
        targetListId: "list_2",
        rememberRoute: true,
        alternativeListIds: ["list_1", "list_1"],
      }).success,
    ).toBe(false);
    expect(
      moveShoppingItemInput.safeParse({
        itemId: "item_1",
        targetListId: "list_2",
        rememberRoute: true,
        alternativeListIds: ["list_2"],
      }).success,
    ).toBe(false);
  });
});
