import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  shoppingIngredientRouteAlternatives,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingLists,
  type User,
} from "~/server/db/schema";
import type { ShoppingIngredientRoute } from "~/lib/shopping-routing";

export type ShoppingWorkspace = NonNullable<
  Awaited<ReturnType<typeof getShoppingWorkspace>>
>;
export type ShoppingListWithItems = ShoppingWorkspace["selectedList"];
export type ShoppingItemRow =
  NonNullable<ShoppingListWithItems>["items"][number];

/**
 * All user-owned lists plus one explicitly selected active list. Selection is
 * URL state and never mutates the independently persisted default.
 */
export async function getShoppingWorkspace(
  user: User | null,
  selectedListId?: string | null,
) {
  if (!isDbConfigured() || !user) return null;
  const lists = await db.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, user.id),
    orderBy: [asc(shoppingLists.name), asc(shoppingLists.id)],
    with: {
      items: {
        orderBy: [asc(shoppingListItems.position), asc(shoppingListItems.item)],
      },
    },
  });

  const activeLists = lists.filter((list) => list.archivedAt == null);
  const defaultList =
    activeLists.find((list) => list.isDefault) ?? activeLists[0] ?? null;
  const selectedList =
    activeLists.find((list) => list.id === selectedListId) ??
    defaultList ??
    null;

  const routeRows = await db.query.shoppingIngredientRoutes.findMany({
    where: eq(shoppingIngredientRoutes.userId, user.id),
    orderBy: [asc(shoppingIngredientRoutes.normalizedItem)],
  });
  const alternativeRows =
    routeRows.length === 0
      ? []
      : await db.query.shoppingIngredientRouteAlternatives.findMany({
          where: inArray(
            shoppingIngredientRouteAlternatives.routeId,
            routeRows.map((route) => route.id),
          ),
          orderBy: [
            asc(shoppingIngredientRouteAlternatives.position),
            asc(shoppingIngredientRouteAlternatives.listId),
          ],
        });
  const alternativesByRoute = new Map<string, string[]>();
  for (const alternative of alternativeRows) {
    const ids = alternativesByRoute.get(alternative.routeId) ?? [];
    ids.push(alternative.listId);
    alternativesByRoute.set(alternative.routeId, ids);
  }
  const routes: ShoppingIngredientRoute[] = routeRows.map((route) => ({
    id: route.id,
    foodId: route.foodId,
    normalizedItem: route.normalizedItem,
    preferredListId: route.preferredListId,
    alternativeListIds: alternativesByRoute.get(route.id) ?? [],
  }));

  return {
    lists,
    selectedList,
    selectedListId: selectedList?.id ?? null,
    defaultListId: defaultList?.id ?? null,
    routes,
  };
}
