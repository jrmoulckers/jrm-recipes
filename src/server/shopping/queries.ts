import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  shoppingListItems,
  shoppingLists,
  type User,
} from "~/server/db/schema";

export type ShoppingListWithItems = NonNullable<
  Awaited<ReturnType<typeof getShoppingList>>
>;
export type ShoppingItemRow = ShoppingListWithItems["items"][number];

/** The user's active (most recent) shopping list with its items, or null. */
export async function getShoppingList(user: User | null) {
  if (!isDbConfigured() || !user) return null;
  const list = await db.query.shoppingLists.findFirst({
    where: eq(shoppingLists.userId, user.id),
    orderBy: [desc(shoppingLists.updatedAt)],
    with: {
      items: {
        orderBy: [asc(shoppingListItems.position), asc(shoppingListItems.item)],
      },
    },
  });
  return list ?? null;
}
