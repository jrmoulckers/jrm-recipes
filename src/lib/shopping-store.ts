"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  categorize,
  mergeShoppingItems,
  toShoppingItems,
  type ShoppingCategory,
  type ShoppingItemInput,
  type ShoppingRecipeInput,
} from "~/lib/shopping-list";
import {
  findIngredientRoute,
  ingredientRouteIdentity,
  partitionShoppingItemsByDestination,
  type ShoppingIngredientRoute,
} from "~/lib/shopping-routing";

/**
 * Offline shopping list. When no database is configured the app still needs a
 * fully working list, so we keep it in the browser (persisted to localStorage)
 * and reuse the exact same aggregation core as the server path.
 */

export type LocalShoppingItem = {
  id: string;
  item: string;
  foodId: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  note: string | null;
  category: ShoppingCategory;
  optional: boolean;
  checked: boolean;
  recipeId: string | null;
};

export type LocalShoppingList = {
  id: string;
  name: string;
  storeName: string | null;
  isDefault: boolean;
  archived: boolean;
  items: LocalShoppingItem[];
};

export type LocalShoppingRoute = ShoppingIngredientRoute & {
  displayItem: string;
};

export type ManualEntry = {
  item: string;
  foodId?: string | null;
  quantity?: number | null;
  quantityMax?: number | null;
  unit?: string | null;
  note?: string | null;
};

type ShoppingStore = {
  lists: LocalShoppingList[];
  defaultListId: string;
  currentListId: string;
  routes: LocalShoppingRoute[];
  addRecipe: (recipe: ShoppingRecipeInput) => void;
  addManual: (listId: string, entry: ManualEntry) => void;
  createList: (name: string, storeName?: string | null) => string;
  renameList: (id: string, name: string, storeName?: string | null) => void;
  setCurrentList: (id: string) => void;
  makeDefault: (id: string) => void;
  archiveList: (id: string) => void;
  restoreList: (id: string) => void;
  deleteList: (id: string) => void;
  moveItem: (
    itemId: string,
    targetListId: string,
    rememberRoute?: boolean,
    alternativeListIds?: string[],
  ) => void;
  setChecked: (id: string, checked: boolean) => void;
  setCategory: (id: string, category: ShoppingCategory) => void;
  remove: (id: string) => void;
  clearChecked: (listId: string) => void;
  clearAll: (listId: string) => void;
};

const LOCAL_DEFAULT_LIST_ID = "local-default";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultList(items: LocalShoppingItem[] = []): LocalShoppingList {
  return {
    id: LOCAL_DEFAULT_LIST_ID,
    name: "Shopping list",
    storeName: null,
    isDefault: true,
    archived: false,
    items,
  };
}

/** Re-consolidate the unchecked, un-noted items with a set of new inputs. */
function consolidate(
  existing: LocalShoppingItem[],
  incoming: ShoppingItemInput[],
): LocalShoppingItem[] {
  const preserved = existing.filter(
    (i) => i.checked || (i.note ?? "").length > 0,
  );
  const pool = existing.filter(
    (i) => !i.checked && (i.note ?? "").length === 0,
  );

  const poolInputs: ShoppingItemInput[] = pool.map((i) => ({
    item: i.item,
    foodId: i.foodId,
    quantity: i.quantity,
    quantityMax: i.quantityMax,
    unit: i.unit,
    optional: i.optional,
    recipeId: i.recipeId,
  }));

  const merged = mergeShoppingItems([...poolInputs, ...incoming]).map(
    (m): LocalShoppingItem => ({
      id: m.key,
      item: m.item,
      foodId: m.foodId,
      quantity: m.quantity,
      quantityMax: m.quantityMax,
      unit: m.unit,
      note: null,
      category: m.category,
      optional: m.optional,
      checked: false,
      recipeId: m.recipeIds[0] ?? null,
    }),
  );

  return [...preserved, ...merged];
}

function activeLists(lists: LocalShoppingList[]) {
  return lists.filter((list) => !list.archived);
}

function optionalStoreName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : null;
}

function normalizedAlternatives(
  ids: readonly string[],
  preferredListId: string,
  lists: readonly LocalShoppingList[],
  includeArchived = false,
) {
  const active = new Set(
    lists
      .filter((list) => includeArchived || !list.archived)
      .map((list) => list.id),
  );
  return ids.filter(
    (id, index) =>
      id !== preferredListId && active.has(id) && ids.indexOf(id) === index,
  );
}

function upsertRoute(
  routes: LocalShoppingRoute[],
  item: Pick<LocalShoppingItem, "item" | "foodId">,
  preferredListId: string,
  alternativeListIds: string[],
  lists: LocalShoppingList[],
): LocalShoppingRoute[] {
  const identity = ingredientRouteIdentity(item);
  const existing = findIngredientRoute(item, routes);
  const next: LocalShoppingRoute = {
    id: existing?.id ?? uid(),
    foodId: identity.foodId,
    normalizedItem: identity.normalizedItem,
    displayItem: item.item,
    preferredListId,
    alternativeListIds: normalizedAlternatives(
      alternativeListIds,
      preferredListId,
      lists,
    ),
  };
  return existing
    ? routes.map((route) => (route.id === existing.id ? next : route))
    : [...routes, next];
}

function promoteRoutes(
  routes: LocalShoppingRoute[],
  unavailableListId: string,
  fallbackListId: string,
  lists: LocalShoppingList[],
  preserveDormantAlternatives = false,
): LocalShoppingRoute[] {
  const active = new Set(
    lists.filter((list) => !list.archived).map((list) => list.id),
  );
  return routes.map((route) => {
    if (route.preferredListId !== unavailableListId) {
      return {
        ...route,
        alternativeListIds: preserveDormantAlternatives
          ? route.alternativeListIds
          : route.alternativeListIds.filter((id) => active.has(id)),
      };
    }
    const alternatives = route.alternativeListIds.filter(
      (id) => id !== unavailableListId && active.has(id),
    );
    const preferredListId = alternatives[0] ?? fallbackListId;
    return {
      ...route,
      preferredListId,
      alternativeListIds: alternatives.filter((id) => id !== preferredListId),
    };
  });
}

function ensureActiveFallback(
  lists: LocalShoppingList[],
  unavailableListId: string,
): { lists: LocalShoppingList[]; fallbackListId: string } {
  const fallback = activeLists(lists).find(
    (list) => list.id !== unavailableListId,
  );
  if (fallback) return { lists, fallbackListId: fallback.id };
  const created: LocalShoppingList = {
    ...defaultList(),
    id: uid(),
  };
  return { lists: [...lists, created], fallbackListId: created.id };
}

type PersistedShoppingState = Partial<
  Pick<ShoppingStore, "lists" | "defaultListId" | "currentListId" | "routes">
> & {
  items?: LocalShoppingItem[];
};

function isPersistedList(value: unknown): value is LocalShoppingList {
  if (!value || typeof value !== "object") return false;
  const list = value as Partial<LocalShoppingList>;
  return (
    typeof list.id === "string" &&
    typeof list.name === "string" &&
    (typeof list.storeName === "string" || list.storeName === null) &&
    typeof list.isDefault === "boolean" &&
    typeof list.archived === "boolean" &&
    Array.isArray(list.items)
  );
}

function isPersistedRoute(value: unknown): value is LocalShoppingRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as Partial<LocalShoppingRoute>;
  return (
    typeof route.id === "string" &&
    (typeof route.foodId === "string" || route.foodId === null) &&
    typeof route.normalizedItem === "string" &&
    typeof route.displayItem === "string" &&
    typeof route.preferredListId === "string" &&
    Array.isArray(route.alternativeListIds)
  );
}

export function migrateShoppingState(
  persisted: unknown,
  version: number,
): PersistedShoppingState {
  const saved =
    persisted && typeof persisted === "object"
      ? (persisted as PersistedShoppingState)
      : {};
  if (version < 1) {
    const items = Array.isArray(saved.items) ? saved.items : [];
    return {
      lists: [defaultList(items)],
      defaultListId: LOCAL_DEFAULT_LIST_ID,
      currentListId: LOCAL_DEFAULT_LIST_ID,
      routes: [],
    };
  }
  return saved;
}

function mergeShoppingState(
  persisted: unknown,
  current: ShoppingStore,
): ShoppingStore {
  const saved =
    persisted && typeof persisted === "object"
      ? (persisted as PersistedShoppingState)
      : {};
  const validLists = Array.isArray(saved.lists)
    ? saved.lists.filter(isPersistedList)
    : [];
  const candidates = validLists.length > 0 ? validLists : current.lists;
  const lists = candidates.some((list) => !list.archived)
    ? candidates
    : [...candidates, { ...defaultList(), id: uid() }];
  const active = lists.filter((list) => !list.archived);
  const selectedDefault =
    active.find(
      (list) =>
        list.id === saved.defaultListId ||
        (saved.defaultListId == null && list.isDefault),
    ) ??
    active.find((list) => list.isDefault) ??
    active[0]!;
  const normalizedLists = lists.map((list) => ({
    ...list,
    isDefault: list.id === selectedDefault.id,
  }));
  const currentListId = active.some((list) => list.id === saved.currentListId)
    ? saved.currentListId!
    : selectedDefault.id;
  const activeIds = new Set(active.map((list) => list.id));
  const routes = (
    Array.isArray(saved.routes) ? saved.routes.filter(isPersistedRoute) : []
  ).map((route) => {
    const preferredListId = activeIds.has(route.preferredListId)
      ? route.preferredListId
      : selectedDefault.id;
    return {
      ...route,
      preferredListId,
      alternativeListIds: normalizedAlternatives(
        route.alternativeListIds.filter(
          (id): id is string => typeof id === "string",
        ),
        preferredListId,
        normalizedLists,
        true,
      ),
    };
  });
  return {
    ...current,
    lists: normalizedLists,
    defaultListId: selectedDefault.id,
    currentListId,
    routes,
  };
}

export const useShoppingStore = create<ShoppingStore>()(
  persist(
    (set) => ({
      lists: [defaultList()],
      defaultListId: LOCAL_DEFAULT_LIST_ID,
      currentListId: LOCAL_DEFAULT_LIST_ID,
      routes: [],
      addRecipe: (recipe) =>
        set((state) => {
          const active = activeLists(state.lists);
          const defaultListId = active.some(
            (list) => list.id === state.defaultListId,
          )
            ? state.defaultListId
            : active[0]?.id;
          if (!defaultListId) return state;
          const partitioned = partitionShoppingItemsByDestination(
            toShoppingItems(recipe),
            state.routes,
            new Set(active.map((list) => list.id)),
            defaultListId,
          );
          return {
            lists: state.lists.map((list) => {
              const incoming = partitioned.get(list.id);
              return incoming
                ? { ...list, items: consolidate(list.items, incoming) }
                : list;
            }),
          };
        }),
      addManual: (listId, entry) =>
        set((state) => {
          const target = state.lists.find(
            (list) => list.id === listId && !list.archived,
          );
          if (!target) return state;
          const item: LocalShoppingItem = {
            id: uid(),
            item: entry.item.trim(),
            foodId: entry.foodId ?? null,
            quantity: entry.quantity ?? null,
            quantityMax: entry.quantityMax ?? null,
            unit: entry.unit?.trim() ?? null,
            note: entry.note?.trim() ?? null,
            category: categorize(entry.item),
            optional: false,
            checked: false,
            recipeId: null,
          };
          return {
            lists: state.lists.map((list) =>
              list.id === listId
                ? { ...list, items: [...list.items, item] }
                : list,
            ),
          };
        }),
      createList: (name, storeName) => {
        const id = uid();
        set((state) => ({
          lists: [
            ...state.lists,
            {
              id,
              name: name.trim(),
              storeName: optionalStoreName(storeName),
              isDefault: false,
              archived: false,
              items: [],
            },
          ],
          currentListId: id,
        }));
        return id;
      },
      renameList: (id, name, storeName) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === id
              ? {
                  ...list,
                  name: name.trim(),
                  storeName: optionalStoreName(storeName),
                }
              : list,
          ),
        })),
      setCurrentList: (id) =>
        set((state) =>
          state.lists.some((list) => list.id === id && !list.archived)
            ? { currentListId: id }
            : state,
        ),
      makeDefault: (id) =>
        set((state) =>
          state.lists.some((list) => list.id === id && !list.archived)
            ? {
                lists: state.lists.map((list) => ({
                  ...list,
                  isDefault: list.id === id,
                })),
                defaultListId: id,
              }
            : state,
        ),
      archiveList: (id) =>
        set((state) => {
          const target = state.lists.find((list) => list.id === id);
          if (!target || target.archived) return state;
          const ensured = ensureActiveFallback(state.lists, id);
          const fallbackListId = target.isDefault
            ? ensured.fallbackListId
            : state.defaultListId;
          const lists = ensured.lists.map((list) => ({
            ...list,
            archived: list.id === id ? true : list.archived,
            isDefault: list.id === fallbackListId,
          }));
          return {
            lists,
            defaultListId: fallbackListId,
            currentListId:
              state.currentListId === id
                ? ensured.fallbackListId
                : state.currentListId,
            routes: promoteRoutes(
              state.routes,
              id,
              fallbackListId,
              lists,
              true,
            ),
          };
        }),
      restoreList: (id) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === id ? { ...list, archived: false } : list,
          ),
        })),
      deleteList: (id) =>
        set((state) => {
          const target = state.lists.find((list) => list.id === id);
          if (!target) return state;
          const ensured = ensureActiveFallback(state.lists, id);
          const fallbackListId = target.isDefault
            ? ensured.fallbackListId
            : state.defaultListId;
          const lists = ensured.lists
            .filter((list) => list.id !== id)
            .map((list) => ({
              ...list,
              isDefault: list.id === fallbackListId,
            }));
          return {
            lists,
            defaultListId: fallbackListId,
            currentListId:
              state.currentListId === id
                ? ensured.fallbackListId
                : state.currentListId,
            routes: promoteRoutes(state.routes, id, fallbackListId, lists),
          };
        }),
      moveItem: (
        itemId,
        targetListId,
        rememberRoute = false,
        alternativeListIds = [],
      ) =>
        set((state) => {
          const target = state.lists.find(
            (list) => list.id === targetListId && !list.archived,
          );
          const source = state.lists.find((list) =>
            list.items.some((item) => item.id === itemId),
          );
          const item = source?.items.find(
            (candidate) => candidate.id === itemId,
          );
          if (!target || !source || !item || source.id === target.id) {
            return state;
          }
          const lists = state.lists.map((list) => {
            if (list.id === source.id) {
              return {
                ...list,
                items: list.items.filter(
                  (candidate) => candidate.id !== itemId,
                ),
              };
            }
            if (list.id !== target.id) return list;
            if (item.checked || (item.note ?? "").length > 0) {
              return { ...list, items: [...list.items, item] };
            }
            return { ...list, items: consolidate(list.items, [item]) };
          });
          return {
            lists,
            routes: rememberRoute
              ? upsertRoute(
                  state.routes,
                  item,
                  targetListId,
                  alternativeListIds,
                  lists,
                )
              : state.routes,
          };
        }),
      setChecked: (id, checked) =>
        set((state) => ({
          lists: state.lists.map((list) => ({
            ...list,
            items: list.items.map((item) =>
              item.id === id ? { ...item, checked } : item,
            ),
          })),
        })),
      setCategory: (id, category) =>
        set((state) => ({
          lists: state.lists.map((list) => ({
            ...list,
            items: list.items.map((item) =>
              item.id === id ? { ...item, category } : item,
            ),
          })),
        })),
      remove: (id) =>
        set((state) => ({
          lists: state.lists.map((list) => ({
            ...list,
            items: list.items.filter((item) => item.id !== id),
          })),
        })),
      clearChecked: (listId) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  items: list.items.filter((item) => !item.checked),
                }
              : list,
          ),
        })),
      clearAll: (listId) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId ? { ...list, items: [] } : list,
          ),
        })),
    }),
    {
      name: "heirloom-shopping-list",
      version: 1,
      migrate: migrateShoppingState,
      merge: mergeShoppingState,
      partialize: (state) => ({
        lists: state.lists,
        defaultListId: state.defaultListId,
        currentListId: state.currentListId,
        routes: state.routes,
      }),
    },
  ),
);
