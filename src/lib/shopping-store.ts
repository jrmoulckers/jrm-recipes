"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  mergeShoppingItems,
  toShoppingItems,
  type PackageRoundBehavior,
  type ShoppingAggregationOptions,
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
import {
  DEFAULT_UNIT_PREFS,
  isKnownUnit,
  normalizeUnit,
  type Dimension,
  type UnitPrefs,
} from "~/lib/units";

/**
 * Offline shopping list. When no database is configured the app still needs a
 * fully working list, so we keep it in the browser (persisted to localStorage)
 * and reuse the exact same aggregation core as the server path.
 */

export type LocalShoppingItem = {
  id: string;
  /** Stable ingredient identity used only for consolidation, never as an entity id. */
  aggregationKey: string;
  item: string;
  foodId: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  requiredBaseQuantity: number | null;
  requiredBaseQuantityMax: number | null;
  requiredBaseUnit: string | null;
  purchaseQuantity: number | null;
  purchaseUnit: string | null;
  packageCount: number | null;
  packageAmount: number | null;
  packageUnit: string | null;
  packageLabel: string | null;
  note: string | null;
  category: ShoppingCategory;
  optional: boolean;
  checked: boolean;
  recipeId: string | null;
};

export type LocalShoppingList = {
  id: string;
  name: string;
  /** Product-generated names are localized only when rendered, never persisted. */
  generatedName?: boolean;
  storeName: string | null;
  isDefault: boolean;
  archived: boolean;
  items: LocalShoppingItem[];
};

export type LocalShoppingRoute = ShoppingIngredientRoute & {
  displayItem: string;
};

export const SHOPPING_HISTORY_LIMIT = 20;

export type ShoppingHistoryOperation =
  "remove-completed" | "clear-all" | "bulk-move" | "list-rebuild" | "restore";

export type LocalShoppingRestorePoint = {
  id: string;
  listId: string;
  operation: ShoppingHistoryOperation;
  operationGroupId: string | null;
  createdAt: number;
  items: LocalShoppingItem[];
};

export type LocalCustomUnit = {
  id: string;
  name: string;
  dimension: Exclude<Dimension, "temperature">;
  baseUnit: string | null;
  baseAmount: number | null;
  abbreviation: string | null;
  displayAsTrue: boolean;
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
  restorePoints: LocalShoppingRestorePoint[];
  unitPreferences: UnitPrefs;
  customUnits: LocalCustomUnit[];
  packageRounding: boolean;
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
    sourceListId: string,
    itemId: string,
    targetListId: string,
    rememberRoute?: boolean,
    alternativeListIds?: string[],
  ) => void;
  removeCompleted: (listId: string) => string | null;
  uncheckAll: (listId: string) => void;
  clearAll: (listId: string) => string | null;
  bulkMoveItems: (
    sourceListId: string,
    itemIds: string[],
    targetListId: string,
  ) => {
    sourceRestorePointId: string;
    targetRestorePointId: string;
  } | null;
  replaceListItems: (
    listId: string,
    items: LocalShoppingItem[],
  ) => string | null;
  restoreFromHistory: (listId: string, restorePointId: string) => string | null;
  restoreMultipleFromHistory: (
    restores: { listId: string; restorePointId: string }[],
  ) => { listId: string; restorePointId: string }[] | null;
  saveIngredientPackage: (input: {
    itemId: string;
    listId: string;
    preferredListId: string;
    packageAmount?: number;
    packageUnit?: string;
    packageLabel?: string;
    packageRoundBehavior: PackageRoundBehavior;
  }) => void;
  setUnitPreferences: (
    preferences: UnitPrefs,
    packageRounding: boolean,
  ) => void;
  createCustomUnit: (unit: Omit<LocalCustomUnit, "id">) => string;
  updateCustomUnit: (id: string, unit: Omit<LocalCustomUnit, "id">) => void;
  deleteCustomUnit: (id: string) => void;
  setChecked: (listId: string, id: string, checked: boolean) => void;
  setCategory: (listId: string, id: string, category: ShoppingCategory) => void;
  remove: (listId: string, id: string) => void;
};

export const LOCAL_DEFAULT_LIST_ID = "local-default";
export const LOCAL_DEFAULT_LIST_NAME = "Shopping list";

export function displayLocalShoppingListName(
  list: Pick<LocalShoppingList, "id" | "name" | "generatedName">,
  generatedName: string,
): string {
  return list.generatedName === true ||
    (list.id === LOCAL_DEFAULT_LIST_ID && list.name === LOCAL_DEFAULT_LIST_NAME)
    ? generatedName
    : list.name;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultList(items: LocalShoppingItem[] = []): LocalShoppingList {
  return {
    id: LOCAL_DEFAULT_LIST_ID,
    name: LOCAL_DEFAULT_LIST_NAME,
    generatedName: true,
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
  options: ShoppingAggregationOptions,
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
    requiredBaseQuantity: i.requiredBaseQuantity,
    requiredBaseQuantityMax: i.requiredBaseQuantityMax,
    requiredBaseUnit: i.requiredBaseUnit,
    optional: i.optional,
    recipeId: i.recipeId,
  }));
  const availableIds = new Map<string, string[]>();
  for (let index = 0; index < pool.length; index += 1) {
    const item = pool[index]!;
    const [single] = mergeShoppingItems([poolInputs[index]!], options);
    const key = item.aggregationKey || single?.key;
    if (!key) continue;
    availableIds.set(key, [...(availableIds.get(key) ?? []), item.id]);
  }
  const reservedIds = new Set(preserved.map((item) => item.id));

  const merged = mergeShoppingItems([...poolInputs, ...incoming], options).map(
    (m): LocalShoppingItem => {
      const matchingIds = availableIds.get(m.key) ?? [];
      const preservedId = matchingIds.find((id) => !reservedIds.has(id));
      let id = preservedId ?? uid();
      while (reservedIds.has(id)) id = uid();
      reservedIds.add(id);
      return {
        id,
        aggregationKey: m.key,
        item: m.item,
        foodId: m.foodId,
        quantity: m.quantity,
        quantityMax: m.quantityMax,
        unit: m.unit,
        requiredBaseQuantity: m.requiredBaseQuantity,
        requiredBaseQuantityMax: m.requiredBaseQuantityMax,
        requiredBaseUnit: m.requiredBaseUnit,
        purchaseQuantity: m.purchaseQuantity,
        purchaseUnit: m.purchaseUnit,
        packageCount: m.packageCount,
        packageAmount: m.packageAmount,
        packageUnit: m.packageUnit,
        packageLabel: m.packageLabel,
        note: null,
        category: m.category,
        optional: m.optional,
        checked: false,
        recipeId: m.recipeIds[0] ?? null,
      };
    },
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

function cloneItems(items: readonly LocalShoppingItem[]): LocalShoppingItem[] {
  return items.map((item) => ({ ...item }));
}

function createRestorePoint(
  list: LocalShoppingList,
  operation: ShoppingHistoryOperation,
  existing: readonly LocalShoppingRestorePoint[],
  operationGroupId: string | null = null,
): LocalShoppingRestorePoint {
  const newestForList = existing.reduce(
    (newest, point) =>
      point.listId === list.id ? Math.max(newest, point.createdAt) : newest,
    0,
  );
  return {
    id: uid(),
    listId: list.id,
    operation,
    operationGroupId,
    createdAt: Math.max(Date.now(), newestForList + 1),
    items: cloneItems(list.items),
  };
}

/**
 * Keep the newest 20 points for each list. Timestamp ties are resolved by the
 * stable restore-point id so persisted migrations and pruning stay deterministic.
 */
function boundedRestorePoints(
  restorePoints: readonly LocalShoppingRestorePoint[],
): LocalShoppingRestorePoint[] {
  const ordered = [...restorePoints].sort(
    (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
  );
  const counts = new Map<string, number>();
  const retained: LocalShoppingRestorePoint[] = [];
  const prunedGroupIds = new Set<string>();
  for (const point of ordered) {
    const count = counts.get(point.listId) ?? 0;
    if (count >= SHOPPING_HISTORY_LIMIT) {
      if (point.operationGroupId) prunedGroupIds.add(point.operationGroupId);
      continue;
    }
    counts.set(point.listId, count + 1);
    retained.push(point);
  }
  return retained.filter(
    (point) =>
      !point.operationGroupId || !prunedGroupIds.has(point.operationGroupId),
  );
}

function addRestorePoints(
  existing: readonly LocalShoppingRestorePoint[],
  ...points: LocalShoppingRestorePoint[]
) {
  return boundedRestorePoints([...points, ...existing]);
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
    ...existing,
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

function aggregationOptions(
  state: Pick<
    ShoppingStore,
    "unitPreferences" | "customUnits" | "routes" | "packageRounding"
  >,
): ShoppingAggregationOptions {
  return {
    unitPreferences: state.unitPreferences,
    customUnits: state.customUnits,
    packageRules: state.routes,
    packageRounding: state.packageRounding,
  };
}

function reaggregateItem(
  item: LocalShoppingItem,
  options: ShoppingAggregationOptions,
): LocalShoppingItem {
  const [aggregated] = mergeShoppingItems(
    [
      {
        item: item.item,
        foodId: item.foodId,
        quantity: item.quantity,
        quantityMax: item.quantityMax,
        unit: item.unit,
        requiredBaseQuantity: item.requiredBaseQuantity,
        requiredBaseQuantityMax: item.requiredBaseQuantityMax,
        requiredBaseUnit: item.requiredBaseUnit,
        optional: item.optional,
        recipeId: item.recipeId,
      },
    ],
    options,
  );
  return aggregated
    ? {
        ...item,
        quantity: aggregated.quantity,
        quantityMax: aggregated.quantityMax,
        unit: aggregated.unit,
        requiredBaseQuantity: aggregated.requiredBaseQuantity,
        requiredBaseQuantityMax: aggregated.requiredBaseQuantityMax,
        requiredBaseUnit: aggregated.requiredBaseUnit,
        purchaseQuantity: aggregated.purchaseQuantity,
        purchaseUnit: aggregated.purchaseUnit,
        packageCount: aggregated.packageCount,
        packageAmount: aggregated.packageAmount,
        packageUnit: aggregated.packageUnit,
        packageLabel: aggregated.packageLabel,
      }
    : item;
}

function reaggregateLists(
  lists: LocalShoppingList[],
  options: ShoppingAggregationOptions,
): LocalShoppingList[] {
  return lists.map((list) => ({
    ...list,
    items: list.items.map((item) => reaggregateItem(item, options)),
  }));
}

function customUnitNames(unit: LocalCustomUnit): Set<string> {
  return new Set(
    [unit.name, unit.abbreviation]
      .filter((name): name is string => Boolean(name?.trim()))
      .map((name) => name.trim().toLocaleLowerCase()),
  );
}

function canonicalizeCustomUnitRoutes(
  routes: LocalShoppingRoute[],
  unit: LocalCustomUnit,
): { routes: LocalShoppingRoute[]; changed: boolean } {
  const names = customUnitNames(unit);
  const baseUnit = normalizeUnit(unit.baseUnit);
  const baseAmount = unit.baseAmount;
  if (
    !baseUnit ||
    !isKnownUnit(baseUnit) ||
    baseAmount == null ||
    !Number.isFinite(baseAmount) ||
    baseAmount <= 0
  ) {
    return { routes, changed: false };
  }
  let changed = false;
  return {
    routes: routes.map((route) => {
      const packageUnit = route.packageUnit?.trim().toLocaleLowerCase();
      if (
        !packageUnit ||
        !names.has(packageUnit) ||
        route.packageAmount == null
      ) {
        return route;
      }
      changed = true;
      return {
        ...route,
        packageAmount: route.packageAmount * baseAmount,
        packageUnit: baseUnit,
      };
    }),
    changed,
  };
}

function canonicalizeCustomUnitRows(
  lists: LocalShoppingList[],
  unit: LocalCustomUnit,
  options: ShoppingAggregationOptions,
): LocalShoppingList[] {
  const names = customUnitNames(unit);
  return lists.map((list) => ({
    ...list,
    items: list.items.map((item) => {
      const requiredUnit = item.requiredBaseUnit?.trim().toLocaleLowerCase();
      const displayUnit = item.unit?.trim().toLocaleLowerCase();
      return (requiredUnit && names.has(requiredUnit)) ||
        (displayUnit && names.has(displayUnit))
        ? reaggregateItem(item, options)
        : item;
    }),
  }));
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
  const available = activeLists(lists).filter(
    (list) => list.id !== unavailableListId,
  );
  const fallback = available.find((list) => list.isDefault) ?? available[0];
  if (fallback) return { lists, fallbackListId: fallback.id };
  const created: LocalShoppingList = {
    ...defaultList(),
    id: uid(),
  };
  return { lists: [...lists, created], fallbackListId: created.id };
}

type PersistedShoppingState = Partial<
  Pick<
    ShoppingStore,
    | "lists"
    | "defaultListId"
    | "currentListId"
    | "routes"
    | "restorePoints"
    | "unitPreferences"
    | "customUnits"
    | "packageRounding"
  >
> & {
  items?: LocalShoppingItem[];
};

function normalizePersistedLists(
  lists: LocalShoppingList[],
  customUnits: readonly LocalCustomUnit[],
): LocalShoppingList[] {
  const usedIds = new Set<string>();
  return lists.map((list) => ({
    ...list,
    items: list.items.map((item) => {
      const [aggregated] = mergeShoppingItems(
        [
          {
            item: item.item,
            foodId: item.foodId,
            quantity: item.quantity,
            quantityMax: item.quantityMax,
            unit: item.unit,
            requiredBaseQuantity: item.requiredBaseQuantity,
            requiredBaseQuantityMax: item.requiredBaseQuantityMax,
            requiredBaseUnit: item.requiredBaseUnit,
            optional: item.optional,
            recipeId: item.recipeId,
          },
        ],
        { customUnits },
      );
      let id = typeof item.id === "string" && item.id ? item.id : uid();
      while (usedIds.has(id)) id = uid();
      usedIds.add(id);
      return {
        ...item,
        id,
        aggregationKey: item.aggregationKey ?? aggregated?.key ?? id,
      };
    }),
  }));
}

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

function isPersistedRestorePoint(
  value: unknown,
): value is LocalShoppingRestorePoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<LocalShoppingRestorePoint>;
  return (
    typeof point.id === "string" &&
    typeof point.listId === "string" &&
    typeof point.operation === "string" &&
    [
      "remove-completed",
      "clear-all",
      "bulk-move",
      "list-rebuild",
      "restore",
    ].includes(point.operation) &&
    (point.operationGroupId == null ||
      typeof point.operationGroupId === "string") &&
    typeof point.createdAt === "number" &&
    Number.isFinite(point.createdAt) &&
    Array.isArray(point.items)
  );
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
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
    const lists = normalizePersistedLists(
      [defaultList(items)],
      Array.isArray(saved.customUnits) ? saved.customUnits : [],
    );
    return {
      lists,
      defaultListId: LOCAL_DEFAULT_LIST_ID,
      currentListId: LOCAL_DEFAULT_LIST_ID,
      routes: [],
      restorePoints: [],
      unitPreferences: { ...DEFAULT_UNIT_PREFS },
      customUnits: [],
      packageRounding: false,
    };
  }
  if (version < 3 && Array.isArray(saved.lists)) {
    const customUnits = Array.isArray(saved.customUnits)
      ? saved.customUnits
      : [];
    return {
      ...saved,
      restorePoints: Array.isArray(saved.restorePoints)
        ? saved.restorePoints
        : [],
      lists: normalizePersistedLists(saved.lists, customUnits).map((list) => ({
        ...list,
        items: list.items.map((item) => {
          const [canonical] = mergeShoppingItems(
            [
              {
                item: item.item,
                foodId: item.foodId,
                quantity: item.quantity,
                quantityMax: item.quantityMax,
                unit: item.unit,
                optional: item.optional,
                recipeId: item.recipeId,
              },
            ],
            { customUnits },
          );
          return canonical
            ? {
                ...item,
                requiredBaseQuantity: canonical.requiredBaseQuantity,
                requiredBaseQuantityMax: canonical.requiredBaseQuantityMax,
                requiredBaseUnit: canonical.requiredBaseUnit,
              }
            : item;
        }),
      })),
    };
  }
  if (version < 4 && Array.isArray(saved.lists)) {
    return {
      ...saved,
      lists: normalizePersistedLists(
        saved.lists,
        Array.isArray(saved.customUnits) ? saved.customUnits : [],
      ),
    };
  }
  if (version < 2) {
    return { ...saved, restorePoints: [] };
  }
  return saved;
}

export function mergeShoppingState(
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
  const candidates = normalizePersistedLists(
    validLists.length > 0 ? validLists : current.lists,
    Array.isArray(saved.customUnits) ? saved.customUnits : current.customUnits,
  ).map((list) => ({
    ...list,
    items: list.items.map((item) => ({
      ...item,
      foodId: item.foodId ?? null,
      requiredBaseQuantity: hasOwn(item, "requiredBaseQuantity")
        ? item.requiredBaseQuantity
        : (item.quantity ?? null),
      requiredBaseQuantityMax: hasOwn(item, "requiredBaseQuantityMax")
        ? item.requiredBaseQuantityMax
        : (item.quantityMax ?? null),
      requiredBaseUnit: hasOwn(item, "requiredBaseUnit")
        ? item.requiredBaseUnit
        : (item.unit ?? null),
      purchaseQuantity: item.purchaseQuantity ?? null,
      purchaseUnit: item.purchaseUnit ?? null,
      packageCount: item.packageCount ?? null,
      packageAmount: item.packageAmount ?? null,
      packageUnit: item.packageUnit ?? null,
      packageLabel: item.packageLabel ?? null,
    })),
  }));
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
  const listIds = new Set(normalizedLists.map((list) => list.id));
  const restorePoints = boundedRestorePoints(
    (Array.isArray(saved.restorePoints)
      ? saved.restorePoints.filter(isPersistedRestorePoint)
      : []
    ).filter((point) => listIds.has(point.listId)),
  ).map((point) => ({
    ...point,
    operationGroupId:
      typeof point.operationGroupId === "string"
        ? point.operationGroupId
        : null,
  }));
  return {
    ...current,
    lists: normalizedLists,
    defaultListId: selectedDefault.id,
    currentListId,
    routes,
    restorePoints,
    unitPreferences: saved.unitPreferences ?? current.unitPreferences,
    customUnits: Array.isArray(saved.customUnits)
      ? saved.customUnits
      : current.customUnits,
    packageRounding: saved.packageRounding ?? false,
  };
}

export const useShoppingStore = create<ShoppingStore>()(
  persist(
    (set) => ({
      lists: [defaultList()],
      defaultListId: LOCAL_DEFAULT_LIST_ID,
      currentListId: LOCAL_DEFAULT_LIST_ID,
      routes: [],
      restorePoints: [],
      unitPreferences: { ...DEFAULT_UNIT_PREFS },
      customUnits: [],
      packageRounding: false,
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
                ? {
                    ...list,
                    items: consolidate(
                      list.items,
                      incoming,
                      aggregationOptions(state),
                    ),
                  }
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
          const [aggregated] = mergeShoppingItems(
            [
              {
                item: entry.item,
                foodId: entry.foodId,
                quantity: entry.quantity,
                quantityMax: entry.quantityMax,
                unit: entry.unit,
              },
            ],
            aggregationOptions(state),
          );
          if (!aggregated) return state;
          const item: LocalShoppingItem = {
            id: uid(),
            aggregationKey: aggregated.key,
            item: aggregated.item,
            foodId: aggregated.foodId,
            quantity: aggregated.quantity,
            quantityMax: aggregated.quantityMax,
            unit: aggregated.unit,
            requiredBaseQuantity: aggregated.requiredBaseQuantity,
            requiredBaseQuantityMax: aggregated.requiredBaseQuantityMax,
            requiredBaseUnit: aggregated.requiredBaseUnit,
            purchaseQuantity: aggregated.purchaseQuantity,
            purchaseUnit: aggregated.purchaseUnit,
            packageCount: aggregated.packageCount,
            packageAmount: aggregated.packageAmount,
            packageUnit: aggregated.packageUnit,
            packageLabel: aggregated.packageLabel,
            note: entry.note?.trim() ?? null,
            category: aggregated.category,
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
                  generatedName: false,
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
            restorePoints: state.restorePoints.filter(
              (point) => point.listId !== id,
            ),
          };
        }),
      moveItem: (
        sourceListId,
        itemId,
        targetListId,
        rememberRoute = false,
        alternativeListIds = [],
      ) =>
        set((state) => {
          const target = state.lists.find(
            (list) => list.id === targetListId && !list.archived,
          );
          const source = state.lists.find(
            (list) =>
              list.id === sourceListId &&
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
            return {
              ...list,
              items: consolidate(list.items, [item], aggregationOptions(state)),
            };
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
      saveIngredientPackage: (input) =>
        set((state) => {
          const preferred = state.lists.find(
            (list) => list.id === input.preferredListId && !list.archived,
          );
          const source = state.lists.find((list) => list.id === input.listId);
          const item = source?.items.find(
            (candidate) => candidate.id === input.itemId,
          );
          if (!preferred || !source || !item) return state;

          const identity = ingredientRouteIdentity(item);
          const existing = findIngredientRoute(item, state.routes);
          const packageRoundBehavior =
            input.packageAmount == null
              ? "inherit"
              : input.packageRoundBehavior;
          const packageUnit = input.packageUnit?.trim();
          const packageLabel = input.packageLabel?.trim();
          const nextRoute: LocalShoppingRoute = {
            ...existing,
            id: existing?.id ?? uid(),
            foodId: identity.foodId,
            normalizedItem: identity.normalizedItem,
            displayItem: item.item,
            preferredListId: preferred.id,
            alternativeListIds:
              existing?.alternativeListIds.filter(
                (id) => id !== preferred.id,
              ) ?? [],
            packageAmount: input.packageAmount ?? null,
            packageUnit: packageUnit?.length ? packageUnit : null,
            packageLabel: packageLabel?.length ? packageLabel : null,
            packageRoundBehavior,
          };
          const routes = existing
            ? state.routes.map((route) =>
                route.id === existing.id ? nextRoute : route,
              )
            : [...state.routes, nextRoute];
          const options = aggregationOptions({ ...state, routes });
          return {
            routes,
            lists: state.lists.map((list) => ({
              ...list,
              items: list.items.map((candidate) =>
                findIngredientRoute(candidate, [nextRoute])
                  ? reaggregateItem(candidate, options)
                  : candidate,
              ),
            })),
          };
        }),
      setUnitPreferences: (unitPreferences, packageRounding) =>
        set((state) => {
          const next = { ...state, unitPreferences, packageRounding };
          return {
            unitPreferences,
            packageRounding,
            lists: reaggregateLists(state.lists, aggregationOptions(next)),
          };
        }),
      createCustomUnit: (unit) => {
        const id = uid();
        set((state) => {
          const customUnits = [...state.customUnits, { ...unit, id }];
          const normalizedRoutes = canonicalizeCustomUnitRoutes(state.routes, {
            ...unit,
            id,
          });
          const next = {
            ...state,
            customUnits,
            routes: normalizedRoutes.routes,
          };
          return {
            customUnits,
            routes: normalizedRoutes.routes,
            lists: reaggregateLists(state.lists, aggregationOptions(next)),
          };
        });
        return id;
      },
      updateCustomUnit: (id, unit) =>
        set((state) => {
          const oldUnit = state.customUnits.find(
            (candidate) => candidate.id === id,
          );
          if (!oldUnit) return state;
          const normalizedRoutes = canonicalizeCustomUnitRoutes(
            state.routes,
            oldUnit,
          );
          const canonicalizedLists = canonicalizeCustomUnitRows(
            state.lists,
            oldUnit,
            aggregationOptions({ ...state, routes: normalizedRoutes.routes }),
          );
          const customUnits = state.customUnits.map((candidate) =>
            candidate.id === id ? { ...unit, id } : candidate,
          );
          return {
            customUnits,
            routes: normalizedRoutes.routes,
            lists: reaggregateLists(
              canonicalizedLists,
              aggregationOptions({
                ...state,
                customUnits,
                routes: normalizedRoutes.routes,
              }),
            ),
          };
        }),
      deleteCustomUnit: (id) =>
        set((state) => {
          const oldUnit = state.customUnits.find(
            (candidate) => candidate.id === id,
          );
          if (!oldUnit) return state;
          const normalizedRoutes = canonicalizeCustomUnitRoutes(
            state.routes,
            oldUnit,
          );
          const canonicalizedLists = canonicalizeCustomUnitRows(
            state.lists,
            oldUnit,
            aggregationOptions({ ...state, routes: normalizedRoutes.routes }),
          );
          const customUnits = state.customUnits.filter(
            (unit) => unit.id !== id,
          );
          return {
            customUnits,
            routes: normalizedRoutes.routes,
            lists: reaggregateLists(
              canonicalizedLists,
              aggregationOptions({
                ...state,
                customUnits,
                routes: normalizedRoutes.routes,
              }),
            ),
          };
        }),
      setChecked: (listId, id, checked) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === id ? { ...item, checked } : item,
                  ),
                }
              : list,
          ),
        })),
      setCategory: (listId, id, category) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === id ? { ...item, category } : item,
                  ),
                }
              : list,
          ),
        })),
      remove: (listId, id) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  items: list.items.filter((item) => item.id !== id),
                }
              : list,
          ),
        })),
      removeCompleted: (listId) => {
        let restorePointId: string | null = null;
        set((state) => {
          const target = state.lists.find((list) => list.id === listId);
          if (!target?.items.some((item) => item.checked)) return state;
          const point = createRestorePoint(
            target,
            "remove-completed",
            state.restorePoints,
          );
          restorePointId = point.id;
          return {
            lists: state.lists.map((list) =>
              list.id === listId
                ? {
                    ...list,
                    items: list.items.filter((item) => !item.checked),
                  }
                : list,
            ),
            restorePoints: addRestorePoints(state.restorePoints, point),
          };
        });
        return restorePointId;
      },
      uncheckAll: (listId) =>
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  items: list.items.map((item) => ({
                    ...item,
                    checked: false,
                  })),
                }
              : list,
          ),
        })),
      clearAll: (listId) => {
        let restorePointId: string | null = null;
        set((state) => {
          const target = state.lists.find((list) => list.id === listId);
          if (!target || target.items.length === 0) return state;
          const point = createRestorePoint(
            target,
            "clear-all",
            state.restorePoints,
          );
          restorePointId = point.id;
          return {
            lists: state.lists.map((list) =>
              list.id === listId ? { ...list, items: [] } : list,
            ),
            restorePoints: addRestorePoints(state.restorePoints, point),
          };
        });
        return restorePointId;
      },
      bulkMoveItems: (sourceListId, itemIds, targetListId) => {
        let result: {
          sourceRestorePointId: string;
          targetRestorePointId: string;
        } | null = null;
        set((state) => {
          const source = state.lists.find(
            (list) => list.id === sourceListId && !list.archived,
          );
          const target = state.lists.find(
            (list) => list.id === targetListId && !list.archived,
          );
          const selected = new Set(itemIds);
          const moving = source?.items.filter((item) => selected.has(item.id));
          if (
            !source ||
            !target ||
            source.id === target.id ||
            !moving?.length
          ) {
            return state;
          }
          const operationGroupId = uid();
          const sourcePoint = createRestorePoint(
            source,
            "bulk-move",
            state.restorePoints,
            operationGroupId,
          );
          const targetPoint = createRestorePoint(
            target,
            "bulk-move",
            state.restorePoints,
            operationGroupId,
          );
          result = {
            sourceRestorePointId: sourcePoint.id,
            targetRestorePointId: targetPoint.id,
          };
          return {
            lists: state.lists.map((list) => {
              if (list.id === source.id) {
                return {
                  ...list,
                  items: list.items.filter((item) => !selected.has(item.id)),
                };
              }
              if (list.id === target.id) {
                return {
                  ...list,
                  items: moving.reduce(
                    (items, item) =>
                      item.checked || (item.note ?? "").length > 0
                        ? [...items, item]
                        : consolidate(items, [item], aggregationOptions(state)),
                    list.items,
                  ),
                };
              }
              return list;
            }),
            restorePoints: addRestorePoints(
              state.restorePoints,
              sourcePoint,
              targetPoint,
            ),
          };
        });
        return result;
      },
      replaceListItems: (listId, items) => {
        let restorePointId: string | null = null;
        set((state) => {
          const target = state.lists.find(
            (list) => list.id === listId && !list.archived,
          );
          if (!target) return state;
          const point = createRestorePoint(
            target,
            "list-rebuild",
            state.restorePoints,
          );
          restorePointId = point.id;
          return {
            lists: state.lists.map((list) =>
              list.id === listId ? { ...list, items: cloneItems(items) } : list,
            ),
            restorePoints: addRestorePoints(state.restorePoints, point),
          };
        });
        return restorePointId;
      },
      restoreFromHistory: (listId, restorePointId) => {
        let undoPointId: string | null = null;
        set((state) => {
          const target = state.lists.find(
            (list) => list.id === listId && !list.archived,
          );
          const selected = state.restorePoints.find(
            (point) => point.id === restorePointId && point.listId === listId,
          );
          if (!target || !selected) return state;
          const current = createRestorePoint(
            target,
            "restore",
            state.restorePoints,
          );
          undoPointId = current.id;
          return {
            lists: state.lists.map((list) =>
              list.id === listId
                ? { ...list, items: cloneItems(selected.items) }
                : list,
            ),
            restorePoints: addRestorePoints(state.restorePoints, current),
          };
        });
        return undoPointId;
      },
      restoreMultipleFromHistory: (restores) => {
        let undoPoints: { listId: string; restorePointId: string }[] | null =
          null;
        set((state) => {
          const listIds = restores.map((restore) => restore.listId);
          if (new Set(listIds).size !== listIds.length) return state;
          const resolved = restores.map((restore) => {
            const list = state.lists.find(
              (candidate) =>
                candidate.id === restore.listId && !candidate.archived,
            );
            const point = state.restorePoints.find(
              (candidate) =>
                candidate.id === restore.restorePointId &&
                candidate.listId === restore.listId,
            );
            return list && point ? { list, point } : null;
          });
          if (resolved.some((entry) => entry == null)) return state;
          const entries = resolved.filter(
            (
              entry,
            ): entry is {
              list: LocalShoppingList;
              point: LocalShoppingRestorePoint;
            } => entry != null,
          );
          const operationGroupId = uid();
          const current = entries.map(({ list }) =>
            createRestorePoint(
              list,
              "restore",
              state.restorePoints,
              operationGroupId,
            ),
          );
          undoPoints = current.map((point) => ({
            listId: point.listId,
            restorePointId: point.id,
          }));
          const snapshots = new Map(
            entries.map(({ list, point }) => [list.id, point.items]),
          );
          return {
            lists: state.lists.map((list) => {
              const items = snapshots.get(list.id);
              return items ? { ...list, items: cloneItems(items) } : list;
            }),
            restorePoints: addRestorePoints(state.restorePoints, ...current),
          };
        });
        return undoPoints;
      },
    }),
    {
      name: "heirloom-shopping-list",
      version: 4,
      migrate: migrateShoppingState,
      merge: mergeShoppingState,
      partialize: (state) => ({
        lists: state.lists,
        defaultListId: state.defaultListId,
        currentListId: state.currentListId,
        routes: state.routes,
        restorePoints: state.restorePoints,
        unitPreferences: state.unitPreferences,
        customUnits: state.customUnits,
        packageRounding: state.packageRounding,
      }),
    },
  ),
);
