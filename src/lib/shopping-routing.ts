import {
  normalizeItemName,
  type ShoppingItemInput,
  type ShoppingPackageRule,
} from './shopping-list';
import { normalizeIngredient } from './substitutions';

export type IngredientRouteIdentity = {
  key: string;
  foodId: string | null;
  normalizedItem: string;
};

export type ShoppingIngredientRoute = ShoppingPackageRule & {
  id: string;
  foodId: string | null;
  normalizedItem: string;
  preferredListId: string;
  alternativeListIds: string[];
};

export type RoutedDestination = {
  listId: string;
  routeId: string | null;
  alternativeListIds: string[];
};

/**
 * Stable identity shared by server and offline routing. Canonical food ids win;
 * text remains available so older free-text rules can converge when foods later
 * resolve.
 */
export function ingredientRouteIdentity(
  ingredient: Pick<ShoppingItemInput, 'item' | 'foodId'>,
): IngredientRouteIdentity {
  const normalizedFoodId = ingredient.foodId?.trim();
  const foodId = normalizedFoodId?.length ? normalizedFoodId : null;
  const normalizedItem = normalizeIngredient(ingredient.item) || normalizeItemName(ingredient.item);
  return {
    key: foodId ? `food:${foodId}` : `text:${normalizedItem}`,
    foodId,
    normalizedItem,
  };
}

/** Prefer a canonical rule, then reuse a legacy normalized-text rule. */
export function findIngredientRoute(
  ingredient: Pick<ShoppingItemInput, 'item' | 'foodId'>,
  routes: readonly ShoppingIngredientRoute[],
): ShoppingIngredientRoute | null {
  const identity = ingredientRouteIdentity(ingredient);
  if (identity.foodId) {
    const canonical = routes.find((route) => route.foodId === identity.foodId);
    if (canonical) return canonical;
  }
  return routes.find((route) => route.normalizedItem === identity.normalizedItem) ?? null;
}

/**
 * Resolve exactly one active destination. Stale preferred routes fail safely to
 * their first active alternative, then to the explicit default list.
 */
export function resolveIngredientDestination(
  ingredient: Pick<ShoppingItemInput, 'item' | 'foodId'>,
  routes: readonly ShoppingIngredientRoute[],
  activeListIds: ReadonlySet<string>,
  defaultListId: string,
): RoutedDestination {
  const route = findIngredientRoute(ingredient, routes);
  const preferred =
    route && activeListIds.has(route.preferredListId) ? route.preferredListId : null;
  const promoted = route?.alternativeListIds.find((id) => activeListIds.has(id)) ?? null;
  const listId = preferred ?? promoted ?? defaultListId;
  const alternativeListIds =
    route?.alternativeListIds.filter(
      (id, index, ids) => id !== listId && activeListIds.has(id) && ids.indexOf(id) === index,
    ) ?? [];
  return {
    listId,
    routeId: route?.id ?? null,
    alternativeListIds,
  };
}

/** Partition before aggregation so no contribution is copied across lists. */
export function partitionShoppingItemsByDestination<
  T extends Pick<ShoppingItemInput, 'item' | 'foodId'>,
>(
  items: readonly T[],
  routes: readonly ShoppingIngredientRoute[],
  activeListIds: ReadonlySet<string>,
  defaultListId: string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const { listId } = resolveIngredientDestination(item, routes, activeListIds, defaultListId);
    const destination = result.get(listId) ?? [];
    destination.push(item);
    result.set(listId, destination);
  }
  return result;
}
