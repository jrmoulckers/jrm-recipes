import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  shoppingIngredientRouteAlternatives,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingListRestorePointItems,
  shoppingListRestorePoints,
  shoppingLists,
  type ShoppingListRestorePoint,
  type User,
} from "~/server/db/schema";
import type { ShoppingIngredientRoute } from "~/lib/shopping-routing";

export type ShoppingWorkspace = NonNullable<
  Awaited<ReturnType<typeof getShoppingWorkspace>>
>;
export type ShoppingListWithItems = ShoppingWorkspace["selectedList"];
export type ShoppingItemRow =
  NonNullable<ShoppingListWithItems>["items"][number];
export const SHOPPING_HISTORY_LIMIT = 20;
export type ShoppingListHistoryOperation =
  "remove-completed" | "clear-all" | "bulk-move" | "list-rebuild" | "restore";

function historyOperation(
  operation: ShoppingListRestorePoint["operation"],
): ShoppingListHistoryOperation {
  switch (operation) {
    case "remove_completed":
      return "remove-completed";
    case "clear_all":
      return "clear-all";
    case "bulk_move_source":
    case "bulk_move_destination":
      return "bulk-move";
    case "rebuild":
      return "list-rebuild";
    case "restore":
      return "restore";
  }
}

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

/**
 * Return the newest retained snapshots for one owned list. Item ordering is
 * stable for previews and for a later deterministic restore.
 */
export async function getShoppingListHistory(
  user: User | null,
  listId: string,
) {
  if (!isDbConfigured() || !user) return null;

  const list = await db.query.shoppingLists.findFirst({
    where: and(eq(shoppingLists.id, listId), eq(shoppingLists.userId, user.id)),
    columns: { id: true },
  });
  if (!list) throw new Error("NOT_FOUND");

  const points = await db.query.shoppingListRestorePoints.findMany({
    where: and(
      eq(shoppingListRestorePoints.listId, list.id),
      eq(shoppingListRestorePoints.userId, user.id),
    ),
    orderBy: [
      desc(shoppingListRestorePoints.createdAt),
      desc(shoppingListRestorePoints.id),
    ],
    limit: SHOPPING_HISTORY_LIMIT,
    with: {
      items: {
        orderBy: [
          asc(shoppingListRestorePointItems.position),
          asc(shoppingListRestorePointItems.id),
        ],
      },
    },
  });
  const groupIds = points
    .map((point) => point.operationGroupId)
    .filter((id): id is string => id != null);
  const groupedPoints =
    groupIds.length === 0
      ? []
      : await db.query.shoppingListRestorePoints.findMany({
          where: and(
            eq(shoppingListRestorePoints.userId, user.id),
            inArray(shoppingListRestorePoints.operationGroupId, groupIds),
          ),
          columns: {
            id: true,
            listId: true,
            operationGroupId: true,
          },
          orderBy: [
            asc(shoppingListRestorePoints.listId),
            asc(shoppingListRestorePoints.id),
          ],
        });
  const referencesByGroup = new Map<
    string,
    { listId: string; restorePointId: string }[]
  >();
  for (const point of groupedPoints) {
    if (!point.operationGroupId) continue;
    const references = referencesByGroup.get(point.operationGroupId) ?? [];
    references.push({ listId: point.listId, restorePointId: point.id });
    referencesByGroup.set(point.operationGroupId, references);
  }
  return points.map((point) => ({
    ...point,
    operation: historyOperation(point.operation),
    restorePoints: point.operationGroupId
      ? (referencesByGroup.get(point.operationGroupId) ?? [])
      : [{ listId: point.listId, restorePointId: point.id }],
  }));
}

export type ShoppingListHistoryPoint = NonNullable<
  Awaited<ReturnType<typeof getShoppingListHistory>>
>[number];
