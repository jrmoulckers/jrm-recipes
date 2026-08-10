import 'server-only';

import { createId } from '@paralleldrive/cuid2';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import { db } from '~/server/db';
import {
  customUnits,
  mealPlanEntries,
  groupMembers,
  shoppingIngredientRouteAlternatives,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingListRestorePointItems,
  shoppingListRestorePoints,
  shoppingLists,
  shoppingListStores,
  shoppingStores,
  type ShoppingListRestorePoint,
  userUnitPreferences,
  type User,
} from '~/server/db/schema';
import { getRecipe } from '~/server/recipes/queries';
import { parseLeftoversNote } from '~/lib/planner-batch';
import {
  isPantryStaple,
  mergeShoppingItems,
  toShoppingItems,
  type ShoppingCategory,
  type ShoppingAggregationOptions,
  type ShoppingItemInput,
} from '~/lib/shopping-list';
import {
  findIngredientRoute,
  ingredientRouteIdentity,
  partitionShoppingItemsByDestination,
  type ShoppingIngredientRoute,
} from '~/lib/shopping-routing';
import { toCustomUnitDefs, toUnitPrefs } from '~/lib/unit-prefs';
import type {
  CreateShoppingListInput,
  CreateShoppingStoreInput,
  BulkMoveShoppingItemsInput,
  ManualItemInput,
  MoveShoppingItemInput,
  RenameShoppingListInput,
  RenameShoppingStoreInput,
  RestoreShoppingListPointsInput,
  SaveIngredientPackageInput,
} from './validation';
import { planWarningsForRecipes, type PlanSafetyWarning } from '~/server/dietary/gating';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RestoreOperation = ShoppingListRestorePoint['operation'];

export const SHOPPING_RESTORE_POINT_LIMIT = 20;

type OwnedList = {
  id: string;
  userId: string;
  isDefault: boolean;
  archivedAt: Date | null;
};

async function ownedList(
  tx: Tx,
  listId: string,
  userId: string,
  activeOnly = false,
): Promise<OwnedList> {
  const list = await tx.query.shoppingLists.findFirst({
    where: eq(shoppingLists.id, listId),
    columns: {
      id: true,
      userId: true,
      isDefault: true,
      archivedAt: true,
    },
  });
  if (list?.userId !== userId || (activeOnly && list.archivedAt != null)) {
    throw new Error('NOT_FOUND');
  }
  return list;
}

/**
 * Locking the list row is the serialization boundary for snapshots and item
 * replacement. Ownership is part of the locked query, not a preflight check.
 */
async function lockOwnedList(
  tx: Tx,
  listId: string,
  userId: string,
  activeOnly = false,
): Promise<OwnedList> {
  const [list] = await tx
    .select({
      id: shoppingLists.id,
      userId: shoppingLists.userId,
      isDefault: shoppingLists.isDefault,
      archivedAt: shoppingLists.archivedAt,
    })
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, listId), eq(shoppingLists.userId, userId)))
    .for('update');
  if (!list || (activeOnly && list.archivedAt != null)) {
    throw new Error('NOT_FOUND');
  }
  return list;
}

async function lockOwnedLists(
  tx: Tx,
  listIds: Iterable<string>,
  userId: string,
  activeOnly = false,
) {
  const lists: OwnedList[] = [];
  for (const listId of [...new Set(listIds)].sort()) {
    lists.push(await lockOwnedList(tx, listId, userId, activeOnly));
  }
  return lists;
}

async function createRestorePoint(
  tx: Tx,
  list: OwnedList,
  operation: RestoreOperation,
  operationGroupId: string | null = null,
): Promise<string> {
  const items = await tx.query.shoppingListItems.findMany({
    where: eq(shoppingListItems.listId, list.id),
    orderBy: [asc(shoppingListItems.position), asc(shoppingListItems.id)],
  });
  const [restorePoint] = await tx
    .insert(shoppingListRestorePoints)
    .values({
      listId: list.id,
      userId: list.userId,
      operation,
      operationGroupId,
      createdAt: sql`clock_timestamp()`,
    })
    .returning({ id: shoppingListRestorePoints.id });
  if (!restorePoint) throw new Error('NOT_FOUND');

  if (items.length > 0) {
    await tx.insert(shoppingListRestorePointItems).values(
      items.map((item, position) => ({
        restorePointId: restorePoint.id,
        item: item.item,
        quantity: item.quantity,
        quantityMax: item.quantityMax,
        unit: item.unit,
        requiredBaseQuantity: item.requiredBaseQuantity,
        requiredBaseQuantityMax: item.requiredBaseQuantityMax,
        requiredBaseUnit: item.requiredBaseUnit,
        purchaseQuantity: item.purchaseQuantity,
        purchaseUnit: item.purchaseUnit,
        packageCount: item.packageCount,
        packageAmount: item.packageAmount,
        packageUnit: item.packageUnit,
        packageLabel: item.packageLabel,
        category: item.category,
        note: item.note,
        optional: item.optional,
        checked: item.checked,
        recipeId: item.recipeId,
        foodId: item.foodId,
        position,
      })),
    );
  }

  const stale =
    (await tx.query.shoppingListRestorePoints.findMany({
      where: and(
        eq(shoppingListRestorePoints.listId, list.id),
        eq(shoppingListRestorePoints.userId, list.userId),
      ),
      columns: { id: true, operationGroupId: true },
      orderBy: [desc(shoppingListRestorePoints.createdAt), desc(shoppingListRestorePoints.id)],
      offset: SHOPPING_RESTORE_POINT_LIMIT,
    })) ?? [];
  if (stale.length > 0) {
    const staleGroupIds = stale
      .map((point) => point.operationGroupId)
      .filter((id): id is string => id != null);
    if (staleGroupIds.length > 0) {
      await tx
        .delete(shoppingListRestorePoints)
        .where(
          and(
            eq(shoppingListRestorePoints.userId, list.userId),
            inArray(shoppingListRestorePoints.operationGroupId, staleGroupIds),
          ),
        );
    }
    const staleUngroupedIds = stale
      .filter((point) => point.operationGroupId == null)
      .map((point) => point.id);
    if (staleUngroupedIds.length > 0) {
      await tx
        .delete(shoppingListRestorePoints)
        .where(
          and(
            eq(shoppingListRestorePoints.listId, list.id),
            eq(shoppingListRestorePoints.userId, list.userId),
            inArray(shoppingListRestorePoints.id, staleUngroupedIds),
          ),
        );
    }
  }
  return restorePoint.id;
}

async function ownedItem(tx: Tx, itemId: string, userId: string) {
  const item = await tx.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.id, itemId),
    with: { list: { columns: { userId: true } } },
  });
  if (item?.list.userId !== userId) throw new Error('NOT_FOUND');
  return item;
}

async function lockOwnedItemList(tx: Tx, itemId: string, userId: string) {
  const initialItem = await ownedItem(tx, itemId, userId);
  await lockOwnedList(tx, initialItem.listId, userId);
  const item = await ownedItem(tx, itemId, userId);
  if (item.listId !== initialItem.listId) throw new Error('CONFLICT');
  return item;
}

async function createFallbackList(tx: Tx, userId: string) {
  const [created] = await tx
    .insert(shoppingLists)
    .values({ userId, name: 'Shopping list', isDefault: false })
    .returning({
      id: shoppingLists.id,
      userId: shoppingLists.userId,
      isDefault: shoppingLists.isDefault,
      archivedAt: shoppingLists.archivedAt,
    });
  if (!created) throw new Error('NOT_FOUND');
  return created;
}

async function loadOwnedRoutes(
  tx: Tx,
  userId: string,
  ownedListIds: ReadonlySet<string>,
): Promise<ShoppingIngredientRoute[]> {
  const routeRows = await tx.query.shoppingIngredientRoutes.findMany({
    where: eq(shoppingIngredientRoutes.userId, userId),
    orderBy: [asc(shoppingIngredientRoutes.normalizedItem)],
  });
  const alternativeRows =
    routeRows.length === 0
      ? []
      : await tx.query.shoppingIngredientRouteAlternatives.findMany({
          where: inArray(
            shoppingIngredientRouteAlternatives.routeId,
            routeRows.map((route) => route.id),
          ),
          orderBy: [
            asc(shoppingIngredientRouteAlternatives.position),
            asc(shoppingIngredientRouteAlternatives.listId),
          ],
        });

  const alternatives = new Map<string, string[]>();
  for (const row of alternativeRows) {
    if (!ownedListIds.has(row.listId)) throw new Error('NOT_FOUND');
    const ids = alternatives.get(row.routeId) ?? [];
    ids.push(row.listId);
    alternatives.set(row.routeId, ids);
  }

  return routeRows.map((route) => {
    if (!ownedListIds.has(route.preferredListId)) {
      throw new Error('NOT_FOUND');
    }
    return {
      id: route.id,
      foodId: route.foodId,
      normalizedItem: route.normalizedItem,
      preferredListId: route.preferredListId,
      alternativeListIds: alternatives.get(route.id) ?? [],
      packageAmount: route.packageAmount,
      packageUnit: route.packageUnit,
      packageLabel: route.packageLabel,
      packageRoundBehavior:
        route.packageRounding == null ? 'inherit' : route.packageRounding ? 'enable' : 'disable',
    };
  });
}

async function loadAggregationOptions(
  tx: Tx,
  userId: string,
  routes: ShoppingIngredientRoute[],
): Promise<ShoppingAggregationOptions> {
  const [preferenceRow, customUnitRows] = await Promise.all([
    tx.query.userUnitPreferences.findFirst({
      where: eq(userUnitPreferences.userId, userId),
    }),
    tx.query.customUnits.findMany({
      where: eq(customUnits.userId, userId),
      orderBy: [asc(customUnits.createdAt), asc(customUnits.id)],
    }),
  ]);
  return {
    unitPreferences: toUnitPrefs(preferenceRow),
    customUnits: toCustomUnitDefs(customUnitRows),
    packageRules: routes,
    packageRounding: preferenceRow?.packageRounding ?? false,
  };
}

async function routingWorkspace(tx: Tx, userId: string) {
  let lists = await tx.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, userId),
    orderBy: [asc(shoppingLists.name), asc(shoppingLists.id)],
    columns: {
      id: true,
      userId: true,
      isDefault: true,
      archivedAt: true,
    },
  });
  let active = lists.filter((list) => list.archivedAt == null);

  if (active.length === 0) {
    await tx
      .update(shoppingLists)
      .set({ isDefault: false })
      .where(eq(shoppingLists.userId, userId));
    const created = await createFallbackList(tx, userId);
    await tx.update(shoppingLists).set({ isDefault: true }).where(eq(shoppingLists.id, created.id));
    const defaultList = { ...created, isDefault: true };
    lists = [...lists, defaultList];
    active = [defaultList];
  }

  let defaultList = active.find((list) => list.isDefault);
  if (!defaultList) {
    defaultList = active[0]!;
    await tx
      .update(shoppingLists)
      .set({ isDefault: false })
      .where(eq(shoppingLists.userId, userId));
    await tx
      .update(shoppingLists)
      .set({ isDefault: true })
      .where(eq(shoppingLists.id, defaultList.id));
  }

  const ownedIds = new Set(lists.map((list) => list.id));
  const routes = await loadOwnedRoutes(tx, userId, ownedIds);
  const aggregationOptions = await loadAggregationOptions(tx, userId, routes);
  return {
    defaultListId: defaultList.id,
    activeListIds: new Set(active.map((list) => list.id)),
    routes,
    aggregationOptions,
  };
}

function touchList(tx: Tx, listId: string) {
  return tx
    .update(shoppingLists)
    .set({ updatedAt: new Date() })
    .where(eq(shoppingLists.id, listId));
}

function itemInput(
  item: Pick<
    typeof shoppingListItems.$inferSelect,
    | 'item'
    | 'foodId'
    | 'quantity'
    | 'quantityMax'
    | 'unit'
    | 'requiredBaseQuantity'
    | 'requiredBaseQuantityMax'
    | 'requiredBaseUnit'
    | 'optional'
    | 'recipeId'
  >,
): ShoppingItemInput {
  return {
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
  };
}

async function mergeIntoList(
  tx: Tx,
  listId: string,
  contributions: ShoppingItemInput[],
  options: ShoppingAggregationOptions,
) {
  const existing = await tx.query.shoppingListItems.findMany({
    where: eq(shoppingListItems.listId, listId),
  });
  const pool = existing.filter((item) => !item.checked && (item.note ?? '').length === 0);
  const poolInputs = pool.map(itemInput);
  const poolKeys = new Set(mergeShoppingItems(poolInputs, options).map((item) => item.key));
  let added = 0;
  let merged = 0;
  for (const line of mergeShoppingItems(contributions, options)) {
    if (poolKeys.has(line.key)) merged++;
    else added++;
  }

  const consolidated = mergeShoppingItems([...poolInputs, ...contributions], options);
  if (pool.length > 0) {
    await tx.delete(shoppingListItems).where(
      inArray(
        shoppingListItems.id,
        pool.map((item) => item.id),
      ),
    );
  }
  if (consolidated.length > 0) {
    await tx.insert(shoppingListItems).values(
      consolidated.map((item, position) => ({
        listId,
        item: item.item,
        foodId: item.foodId,
        quantity: item.quantity,
        quantityMax: item.quantityMax,
        unit: item.unit,
        requiredBaseQuantity: item.requiredBaseQuantity,
        requiredBaseQuantityMax: item.requiredBaseQuantityMax,
        requiredBaseUnit: item.requiredBaseUnit,
        purchaseQuantity: item.purchaseQuantity,
        purchaseUnit: item.purchaseUnit,
        packageCount: item.packageCount,
        packageAmount: item.packageAmount,
        packageUnit: item.packageUnit,
        packageLabel: item.packageLabel,
        category: item.category,
        optional: item.optional,
        recipeId: item.recipeIds[0] ?? null,
        position,
      })),
    );
  }
  await touchList(tx, listId);
  return { added, merged };
}

async function routeContributions(
  tx: Tx,
  userId: string,
  contributions: ShoppingItemInput[],
  restoreOperation?: RestoreOperation,
) {
  const workspace = await routingWorkspace(tx, userId);
  const partitions = partitionShoppingItemsByDestination(
    contributions,
    workspace.routes,
    workspace.activeListIds,
    workspace.defaultListId,
  );
  const lockedLists = await lockOwnedLists(tx, partitions.keys(), userId, true);
  const restorePoints: RestorePointReference[] = [];
  const operationGroupId = restoreOperation && lockedLists.length > 1 ? createId() : null;
  if (restoreOperation) {
    for (const list of lockedLists) {
      restorePoints.push({
        listId: list.id,
        restorePointId: await createRestorePoint(tx, list, restoreOperation, operationGroupId),
      });
    }
  }
  let added = 0;
  let merged = 0;
  for (const [listId, items] of partitions) {
    const result = await mergeIntoList(tx, listId, items, workspace.aggregationOptions);
    added += result.added;
    merged += result.merged;
  }
  return { added, merged, restorePoints };
}

/**
 * Add a recipe's ingredients (scaled to `desiredServings`) to the user's list,
 * re-consolidating with the existing unchecked, un-noted items so quantities
 * combine unit-aware. Checked items and manually-noted items are left intact.
 *
 * Pantry staples (salt, oil, …) are skipped by default so the list stays short
 * (#412). Pass `includeStaples` to keep them.
 */
export async function addRecipeToList(
  user: User,
  recipeId: string,
  desiredServings?: number,
  includeStaples = false,
): Promise<void> {
  const recipe = await getRecipe(recipeId, user);
  if (!recipe) throw new Error('NOT_FOUND');

  const contributions = toShoppingItems({
    recipeId: recipe.id,
    servings: recipe.servings,
    desiredServings: desiredServings ?? recipe.servings ?? undefined,
    ingredients: recipe.ingredients.map((ing) => ({
      item: ing.item,
      foodId: ing.foodId,
      quantity: ing.quantity,
      quantityMax: ing.quantityMax,
      unit: ing.unit,
      optional: ing.optional,
    })),
  }).filter((item) => includeStaples || !isPantryStaple(item.item));
  if (contributions.length === 0) return;

  await db.transaction(async (tx) => {
    await routeContributions(tx, user.id, contributions);
  });
}

export type BuildFromPlanResult = {
  /** Distinct recipes that contributed ingredients. */
  recipesUsed: number;
  /** New grocery lines created. */
  added: number;
  /** Incoming lines that merged into an existing line. */
  merged: number;
  /** True when the week held no recipe entries at all. */
  empty: boolean;
  /**
   * Proactive allergen/diet gating (#: structured allergens on the food graph):
   * planned recipes that conflict with a saved family profile, keyed by member.
   * Advisory only. The list is still built. The UI surfaces this as a warning.
   */
  warnings: PlanSafetyWarning[];
  /** Per-list pre-build snapshots for immediate undo. */
  restorePoints: RestorePointReference[];
};

export type RestorePointReference = {
  listId: string;
  restorePointId: string;
};

export type BulkMoveUndoToken = {
  restorePoints: RestorePointReference[];
};

/**
 * Build the user's shopping list from every recipe planned in a date range
 * (#361). Reuses the exact scaling/merge core (`toShoppingItems` +
 * `mergeShoppingItems`) so quantities combine unit-aware, and re-runs MERGE into
 * the existing list rather than duplicating. Note-only plan entries and
 * leftovers nights (which reuse a recipe id) are skipped so we don't double-buy.
 * Pantry staples are dropped by default to keep the list short (#412).
 */
export async function buildListFromPlan(
  user: User,
  startDate: string,
  endDate: string,
  groupId: string | null = null,
  includeStaples = false,
): Promise<BuildFromPlanResult> {
  if (groupId != null) {
    const membership = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)),
      columns: { id: true },
    });
    if (!membership) throw new Error('FORBIDDEN');
  }
  const scope =
    groupId != null
      ? eq(mealPlanEntries.groupId, groupId)
      : and(eq(mealPlanEntries.userId, user.id), isNull(mealPlanEntries.groupId));
  const entries = await db.query.mealPlanEntries.findMany({
    where: and(
      scope,
      isNotNull(mealPlanEntries.recipeId),
      gte(mealPlanEntries.date, startDate),
      lte(mealPlanEntries.date, endDate),
    ),
    columns: {
      recipeId: true,
      note: true,
      servingsMade: true,
      leftoverSourceId: true,
    },
    with: {
      recipe: {
        columns: { id: true, servings: true },
        with: {
          ingredients: {
            columns: {
              item: true,
              foodId: true,
              quantity: true,
              quantityMax: true,
              unit: true,
              optional: true,
            },
          },
        },
      },
    },
  });

  // Skip leftovers nights (they reuse a recipe id via a structured note) so a
  // batch-cooked meal isn't shopped for twice. Cooking the same recipe on two
  // separate nights DOES contribute twice (quantities combine below).
  const cooking = entries.filter(
    (e) => e.recipe != null && e.leftoverSourceId == null && parseLeftoversNote(e.note) == null,
  );
  if (cooking.length === 0) {
    return {
      recipesUsed: 0,
      added: 0,
      merged: 0,
      empty: true,
      warnings: [],
      restorePoints: [],
    };
  }

  const contributions: ShoppingItemInput[] = [];
  const recipeIds = new Set<string>();
  for (const entry of cooking) {
    const recipe = entry.recipe!;
    const baseServings = recipe.servings ?? 4;
    recipeIds.add(recipe.id);
    const items = toShoppingItems({
      recipeId: recipe.id,
      servings: baseServings,
      desiredServings: entry.servingsMade ?? baseServings,
      ingredients: recipe.ingredients.map((ing) => ({
        item: ing.item,
        foodId: ing.foodId,
        quantity: ing.quantity,
        quantityMax: ing.quantityMax,
        unit: ing.unit,
        optional: ing.optional,
      })),
    }).filter((item) => includeStaples || !isPantryStaple(item.item));
    contributions.push(...items);
  }

  // Proactive allergen/diet gating for the whole planned week: flag any cooked
  // recipe that conflicts with a saved family profile. Best-effort. Never blocks
  // building the list.
  const warningsByRecipe = await planWarningsForRecipes(user.id, [...recipeIds]);
  const warnings = [...warningsByRecipe.values()].flat();

  if (contributions.length === 0) {
    return {
      recipesUsed: recipeIds.size,
      added: 0,
      merged: 0,
      empty: false,
      warnings,
      restorePoints: [],
    };
  }

  return db.transaction(async (tx) => {
    const { added, merged, restorePoints } = await routeContributions(
      tx,
      user.id,
      contributions,
      'rebuild',
    );
    return {
      recipesUsed: recipeIds.size,
      added,
      merged,
      empty: false,
      warnings,
      restorePoints,
    };
  });
}

/** Append a single hand-typed grocery line. */
export async function addManualItem(user: User, input: ManualItemInput): Promise<void> {
  await db.transaction(async (tx) => {
    const list = await lockOwnedList(tx, input.listId, user.id, true);
    const workspace = await routingWorkspace(tx, user.id);
    const [aggregated] = mergeShoppingItems(
      [
        {
          item: input.item,
          quantity: input.quantity ?? null,
          quantityMax: input.quantityMax ?? null,
          unit: input.unit ?? null,
        },
      ],
      workspace.aggregationOptions,
    );
    if (!aggregated) throw new Error('INVALID_INPUT');
    const [{ next } = { next: 0 }] = await tx
      .select({
        next: sql<number>`coalesce(max(${shoppingListItems.position}), -1) + 1`,
      })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, list.id));

    await tx.insert(shoppingListItems).values({
      listId: list.id,
      item: aggregated.item,
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
      note: input.note ?? null,
      category: aggregated.category,
      position: next,
    });
    await touchList(tx, list.id);
  });
}

/**
 * Resolve a list's store selection into owned store ids, creating any stores
 * typed inline. Names are matched case-insensitively so the library never grows
 * a near-duplicate of a store the shopper already has.
 */
async function resolveStoreIds(
  tx: Tx,
  userId: string,
  storeIds: string[],
  newStoreNames: string[],
): Promise<string[]> {
  const resolved: string[] = [];
  const seen = new Set<string>();

  if (storeIds.length > 0) {
    const owned = await tx.query.shoppingStores.findMany({
      where: and(eq(shoppingStores.userId, userId), inArray(shoppingStores.id, storeIds)),
      columns: { id: true },
    });
    const ownedIds = new Set(owned.map((store) => store.id));
    for (const storeId of storeIds) {
      if (!ownedIds.has(storeId)) throw new Error('NOT_FOUND');
      if (seen.has(storeId)) continue;
      seen.add(storeId);
      resolved.push(storeId);
    }
  }

  for (const rawName of newStoreNames) {
    const name = rawName.trim();
    if (name.length === 0) continue;
    const storeId = await upsertStore(tx, userId, name);
    if (seen.has(storeId)) continue;
    seen.add(storeId);
    resolved.push(storeId);
  }

  return resolved;
}

/** Find (case-insensitively) or create one store in the user's library. */
async function upsertStore(tx: Tx, userId: string, name: string): Promise<string> {
  const [existing] = await tx
    .select({ id: shoppingStores.id })
    .from(shoppingStores)
    .where(
      and(eq(shoppingStores.userId, userId), sql`lower(${shoppingStores.name}) = lower(${name})`),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(shoppingStores)
    .values({ userId, name })
    .returning({ id: shoppingStores.id });
  if (!created) throw new Error('NOT_FOUND');
  return created.id;
}

/**
 * Replace a list's store links. `shopping_lists.store_name` is dual-written
 * with the first store for the expand/contract window (see docs/migrations.md).
 */
async function setListStores(tx: Tx, listId: string, storeIds: string[]): Promise<void> {
  await tx.delete(shoppingListStores).where(eq(shoppingListStores.listId, listId));
  if (storeIds.length > 0) {
    await tx.insert(shoppingListStores).values(
      storeIds.map((storeId, position) => ({
        listId,
        storeId,
        position,
      })),
    );
  }
  const [primary] = storeIds.length
    ? await tx
        .select({ name: shoppingStores.name })
        .from(shoppingStores)
        .where(eq(shoppingStores.id, storeIds[0]!))
        .limit(1)
    : [];
  await tx
    .update(shoppingLists)
    .set({ storeName: primary?.name ?? null })
    .where(eq(shoppingLists.id, listId));
}

export async function createShoppingStore(
  user: User,
  input: CreateShoppingStoreInput,
): Promise<{ storeId: string }> {
  return db.transaction(async (tx) => ({
    storeId: await upsertStore(tx, user.id, input.name),
  }));
}

export async function renameShoppingStore(
  user: User,
  input: RenameShoppingStoreInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const store = await tx.query.shoppingStores.findFirst({
      where: eq(shoppingStores.id, input.storeId),
      columns: { id: true, userId: true },
    });
    if (store?.userId !== user.id) throw new Error('NOT_FOUND');
    const [clash] = await tx
      .select({ id: shoppingStores.id })
      .from(shoppingStores)
      .where(
        and(
          eq(shoppingStores.userId, user.id),
          sql`lower(${shoppingStores.name}) = lower(${input.name})`,
        ),
      )
      .limit(1);
    if (clash && clash.id !== store.id) throw new Error('CONFLICT');
    await tx
      .update(shoppingStores)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(shoppingStores.id, store.id));
    await syncStoreNameMirror(tx, user.id);
  });
}

/** Deleting a store unlinks it everywhere; lists and their items are kept. */
export async function deleteShoppingStore(user: User, storeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const store = await tx.query.shoppingStores.findFirst({
      where: eq(shoppingStores.id, storeId),
      columns: { id: true, userId: true },
    });
    if (store?.userId !== user.id) throw new Error('NOT_FOUND');
    await tx.delete(shoppingStores).where(eq(shoppingStores.id, store.id));
    await syncStoreNameMirror(tx, user.id);
  });
}

/** Re-derive the legacy `store_name` mirror for every list the user owns. */
async function syncStoreNameMirror(tx: Tx, userId: string): Promise<void> {
  await tx
    .update(shoppingLists)
    .set({
      storeName: sql`(
        select ${shoppingStores.name}
        from ${shoppingListStores}
        join ${shoppingStores} on ${shoppingStores.id} = ${shoppingListStores.storeId}
        where ${shoppingListStores.listId} = ${shoppingLists.id}
        order by ${shoppingListStores.position} asc
        limit 1
      )`,
    })
    .where(eq(shoppingLists.userId, userId));
}

export async function createShoppingList(user: User, input: CreateShoppingListInput) {
  return db.transaction(async (tx) => {
    const storeIds = await resolveStoreIds(tx, user.id, input.storeIds, input.newStoreNames);
    const active = await tx.query.shoppingLists.findMany({
      where: and(eq(shoppingLists.userId, user.id), isNull(shoppingLists.archivedAt)),
      columns: { id: true, isDefault: true },
    });
    const isDefault = !active.some((list) => list.isDefault);
    if (isDefault) {
      await tx
        .update(shoppingLists)
        .set({ isDefault: false })
        .where(eq(shoppingLists.userId, user.id));
    }
    const [created] = await tx
      .insert(shoppingLists)
      .values({
        userId: user.id,
        name: input.name,
        isDefault,
      })
      .returning({ id: shoppingLists.id });
    if (!created) throw new Error('NOT_FOUND');
    await setListStores(tx, created.id, storeIds);
    return created;
  });
}

export async function renameShoppingList(
  user: User,
  input: RenameShoppingListInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedList(tx, input.listId, user.id);
    const storeIds = await resolveStoreIds(tx, user.id, input.storeIds, input.newStoreNames);
    await tx
      .update(shoppingLists)
      .set({
        name: input.name,
        updatedAt: new Date(),
      })
      .where(eq(shoppingLists.id, input.listId));
    await setListStores(tx, input.listId, storeIds);
  });
}

export async function makeShoppingListDefault(
  user: User,
  listId: string,
): Promise<{ defaultListId: string }> {
  return db.transaction(async (tx) => {
    const list = await ownedList(tx, listId, user.id, true);
    if (!list.isDefault) {
      await tx
        .update(shoppingLists)
        .set({ isDefault: false })
        .where(and(eq(shoppingLists.userId, user.id), eq(shoppingLists.isDefault, true)));
      await tx
        .update(shoppingLists)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(shoppingLists.id, list.id));
    }
    return { defaultListId: list.id };
  });
}

async function prepareListRemoval(tx: Tx, userId: string, target: OwnedList): Promise<string> {
  let lists = await tx.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, userId),
    orderBy: [asc(shoppingLists.name), asc(shoppingLists.id)],
    columns: {
      id: true,
      userId: true,
      isDefault: true,
      archivedAt: true,
    },
  });
  let activeFallbacks = lists.filter((list) => list.id !== target.id && list.archivedAt == null);
  if (activeFallbacks.length === 0) {
    const created = await createFallbackList(tx, userId);
    lists = [...lists, created];
    activeFallbacks = [created];
  }

  let fallback = activeFallbacks.find((list) => list.isDefault);
  if (target.isDefault || !fallback) {
    fallback ??= activeFallbacks[0]!;
    await tx
      .update(shoppingLists)
      .set({ isDefault: false })
      .where(and(eq(shoppingLists.userId, userId), eq(shoppingLists.isDefault, true)));
    await tx
      .update(shoppingLists)
      .set({ isDefault: true })
      .where(eq(shoppingLists.id, fallback.id));
  }

  const ownedIds = new Set(lists.map((list) => list.id));
  const activeIds = new Set(activeFallbacks.map((list) => list.id));
  const routes = await loadOwnedRoutes(tx, userId, ownedIds);
  for (const route of routes) {
    if (route.preferredListId !== target.id) continue;
    const promoted = route.alternativeListIds.find((id) => activeIds.has(id)) ?? fallback.id;
    await tx
      .update(shoppingIngredientRoutes)
      .set({ preferredListId: promoted, updatedAt: new Date() })
      .where(
        and(eq(shoppingIngredientRoutes.id, route.id), eq(shoppingIngredientRoutes.userId, userId)),
      );
    await tx
      .delete(shoppingIngredientRouteAlternatives)
      .where(
        and(
          eq(shoppingIngredientRouteAlternatives.routeId, route.id),
          eq(shoppingIngredientRouteAlternatives.listId, promoted),
        ),
      );
  }
  return fallback.id;
}

export async function archiveShoppingList(
  user: User,
  listId: string,
): Promise<{ fallbackListId: string }> {
  return db.transaction(async (tx) => {
    const list = await ownedList(tx, listId, user.id);
    const fallbackListId = await prepareListRemoval(tx, user.id, list);
    if (list.archivedAt == null) {
      await tx
        .update(shoppingLists)
        .set({
          archivedAt: new Date(),
          isDefault: false,
          updatedAt: new Date(),
        })
        .where(eq(shoppingLists.id, list.id));
    }
    return { fallbackListId };
  });
}

export async function restoreShoppingList(user: User, listId: string): Promise<{ listId: string }> {
  return db.transaction(async (tx) => {
    const list = await ownedList(tx, listId, user.id);
    if (list.archivedAt != null) {
      await tx
        .update(shoppingLists)
        .set({ archivedAt: null, isDefault: false, updatedAt: new Date() })
        .where(eq(shoppingLists.id, list.id));
    }
    return { listId: list.id };
  });
}

export async function deleteShoppingList(
  user: User,
  listId: string,
): Promise<{ fallbackListId: string }> {
  return db.transaction(async (tx) => {
    const list = await ownedList(tx, listId, user.id);
    const fallbackListId = await prepareListRemoval(tx, user.id, list);
    await tx.delete(shoppingLists).where(eq(shoppingLists.id, list.id));
    return { fallbackListId };
  });
}

async function saveItemRoute(
  tx: Tx,
  userId: string,
  item: Pick<typeof shoppingListItems.$inferSelect, 'item' | 'foodId'>,
  preferredListId: string,
  alternativeListIds: string[],
) {
  const lists = await tx.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, userId),
    columns: { id: true },
  });
  const routes = await loadOwnedRoutes(tx, userId, new Set(lists.map((list) => list.id)));
  const identity = ingredientRouteIdentity(item);
  const existing = findIngredientRoute(item, routes);
  let routeId = existing?.id;
  if (routeId) {
    await tx
      .update(shoppingIngredientRoutes)
      .set({
        foodId: identity.foodId,
        normalizedItem: identity.normalizedItem,
        displayItem: item.item,
        preferredListId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(shoppingIngredientRoutes.id, routeId), eq(shoppingIngredientRoutes.userId, userId)),
      );
    await tx
      .delete(shoppingIngredientRouteAlternatives)
      .where(eq(shoppingIngredientRouteAlternatives.routeId, routeId));
  } else {
    const [created] = await tx
      .insert(shoppingIngredientRoutes)
      .values({
        userId,
        foodId: identity.foodId,
        normalizedItem: identity.normalizedItem,
        displayItem: item.item,
        preferredListId,
      })
      .returning({ id: shoppingIngredientRoutes.id });
    routeId = created?.id;
  }
  if (!routeId) throw new Error('NOT_FOUND');
  if (alternativeListIds.length > 0) {
    await tx.insert(shoppingIngredientRouteAlternatives).values(
      alternativeListIds.map((alternativeListId, position) => ({
        routeId,
        listId: alternativeListId,
        position,
      })),
    );
  }
}

async function moveItemWithinTransaction(
  tx: Tx,
  item: Awaited<ReturnType<typeof ownedItem>>,
  target: OwnedList,
  options: ShoppingAggregationOptions,
) {
  if (item.listId === target.id) return;

  const [{ next } = { next: 0 }] = await tx
    .select({
      next: sql<number>`coalesce(max(${shoppingListItems.position}), -1) + 1`,
    })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, target.id));

  if (!item.checked && (item.note ?? '').length === 0) {
    const destination = await tx.query.shoppingListItems.findMany({
      where: eq(shoppingListItems.listId, target.id),
    });
    const sourceKey = mergeShoppingItems([itemInput(item)], options)[0]?.key;
    const compatible = destination.filter(
      (candidate) =>
        !candidate.checked &&
        (candidate.note ?? '').length === 0 &&
        mergeShoppingItems([itemInput(candidate)], options)[0]?.key === sourceKey,
    );
    if (compatible.length > 0) {
      const [merged] = mergeShoppingItems([...compatible.map(itemInput), itemInput(item)], options);
      if (!merged) throw new Error('NOT_FOUND');
      await tx
        .delete(shoppingListItems)
        .where(
          inArray(shoppingListItems.id, [item.id, ...compatible.map((candidate) => candidate.id)]),
        );
      await tx.insert(shoppingListItems).values({
        listId: target.id,
        item: merged.item,
        foodId: merged.foodId,
        quantity: merged.quantity,
        quantityMax: merged.quantityMax,
        unit: merged.unit,
        requiredBaseQuantity: merged.requiredBaseQuantity,
        requiredBaseQuantityMax: merged.requiredBaseQuantityMax,
        requiredBaseUnit: merged.requiredBaseUnit,
        purchaseQuantity: merged.purchaseQuantity,
        purchaseUnit: merged.purchaseUnit,
        packageCount: merged.packageCount,
        packageAmount: merged.packageAmount,
        packageUnit: merged.packageUnit,
        packageLabel: merged.packageLabel,
        category: compatible[0]?.category ?? item.category ?? merged.category,
        optional: merged.optional,
        recipeId: merged.recipeIds[0] ?? null,
        position: next,
      });
    } else {
      await tx
        .update(shoppingListItems)
        .set({ listId: target.id, position: next, updatedAt: new Date() })
        .where(eq(shoppingListItems.id, item.id));
    }
  } else {
    await tx
      .update(shoppingListItems)
      .set({ listId: target.id, position: next, updatedAt: new Date() })
      .where(eq(shoppingListItems.id, item.id));
  }
  await touchList(tx, item.listId);
  await touchList(tx, target.id);
}

/** Save package and preferred-store settings on the shared ingredient route. */
export async function saveIngredientPackage(
  user: User,
  input: SaveIngredientPackageInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedList(tx, input.listId, user.id);
    const item = await ownedItem(tx, input.itemId, user.id);
    if (item.listId !== input.listId) throw new Error('NOT_FOUND');
    const preferred = await ownedList(tx, input.preferredListId, user.id, true);
    const lists = await tx.query.shoppingLists.findMany({
      where: eq(shoppingLists.userId, user.id),
      columns: { id: true },
    });
    const routes = await loadOwnedRoutes(tx, user.id, new Set(lists.map((list) => list.id)));
    const identity = ingredientRouteIdentity(item);
    const existing = findIngredientRoute(item, routes);
    const packageRoundBehavior =
      input.packageAmount == null ? 'inherit' : input.packageRoundBehavior;
    const packageRounding =
      packageRoundBehavior === 'inherit' ? null : packageRoundBehavior === 'enable';
    const fields = {
      foodId: identity.foodId,
      normalizedItem: identity.normalizedItem,
      displayItem: item.item,
      preferredListId: preferred.id,
      packageAmount: input.packageAmount ?? null,
      packageUnit: input.packageUnit ?? null,
      packageLabel: input.packageLabel ?? null,
      packageRounding,
      updatedAt: new Date(),
    };

    let routeId = existing?.id;
    if (routeId) {
      await tx
        .update(shoppingIngredientRoutes)
        .set(fields)
        .where(
          and(
            eq(shoppingIngredientRoutes.id, routeId),
            eq(shoppingIngredientRoutes.userId, user.id),
          ),
        );
      await tx
        .delete(shoppingIngredientRouteAlternatives)
        .where(
          and(
            eq(shoppingIngredientRouteAlternatives.routeId, routeId),
            eq(shoppingIngredientRouteAlternatives.listId, preferred.id),
          ),
        );
    } else {
      const [created] = await tx
        .insert(shoppingIngredientRoutes)
        .values({ ...fields, userId: user.id })
        .returning({ id: shoppingIngredientRoutes.id });
      routeId = created?.id;
    }
    if (!routeId) throw new Error('NOT_FOUND');

    const savedRoute: ShoppingIngredientRoute = {
      id: routeId,
      foodId: identity.foodId,
      normalizedItem: identity.normalizedItem,
      preferredListId: preferred.id,
      alternativeListIds: existing?.alternativeListIds.filter((id) => id !== preferred.id) ?? [],
      packageAmount: input.packageAmount ?? null,
      packageUnit: input.packageUnit ?? null,
      packageLabel: input.packageLabel ?? null,
      packageRoundBehavior,
    };
    const nextRoutes = existing
      ? routes.map((route) => (route.id === existing.id ? savedRoute : route))
      : [...routes, savedRoute];
    const options = await loadAggregationOptions(tx, user.id, nextRoutes);
    const [aggregated] = mergeShoppingItems([itemInput(item)], options);
    if (!aggregated) throw new Error('NOT_FOUND');
    await tx
      .update(shoppingListItems)
      .set({
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
        updatedAt: new Date(),
      })
      .where(eq(shoppingListItems.id, item.id));
  });
}

export async function moveShoppingItem(user: User, input: MoveShoppingItemInput): Promise<void> {
  await db.transaction(async (tx) => {
    const initialItem = await ownedItem(tx, input.itemId, user.id);
    const locked = await lockOwnedLists(tx, [initialItem.listId, input.targetListId], user.id);
    const target = locked.find((list) => list.id === input.targetListId);
    if (!target || target.archivedAt != null) throw new Error('NOT_FOUND');
    const item = await ownedItem(tx, input.itemId, user.id);
    if (!locked.some((list) => list.id === item.listId)) {
      throw new Error('CONFLICT');
    }
    if (
      new Set(input.alternativeListIds).size !== input.alternativeListIds.length ||
      input.alternativeListIds.includes(target.id)
    ) {
      throw new Error('INVALID_INPUT');
    }
    for (const alternativeId of input.alternativeListIds) {
      await ownedList(tx, alternativeId, user.id, true);
    }

    const options = (await routingWorkspace(tx, user.id)).aggregationOptions;
    await moveItemWithinTransaction(tx, item, target, options);

    if (input.rememberRoute) {
      await saveItemRoute(tx, user.id, item, target.id, input.alternativeListIds);
    }
  });
}

export async function bulkMoveShoppingItems(
  user: User,
  input: BulkMoveShoppingItemsInput,
): Promise<{
  restorePoints: RestorePointReference[];
  undoToken: BulkMoveUndoToken | null;
}> {
  return db.transaction(async (tx) => {
    if (new Set(input.itemIds).size !== input.itemIds.length) {
      throw new Error('INVALID_INPUT');
    }
    const initialItems = await Promise.all(
      input.itemIds.map((itemId) => ownedItem(tx, itemId, user.id)),
    );
    const locked = await lockOwnedLists(
      tx,
      [input.targetListId, ...initialItems.map((item) => item.listId)],
      user.id,
      true,
    );
    const target = locked.find((list) => list.id === input.targetListId);
    if (!target) throw new Error('NOT_FOUND');

    const items = await Promise.all(input.itemIds.map((itemId) => ownedItem(tx, itemId, user.id)));
    if (
      items.some(
        (item, index) =>
          item.listId !== initialItems[index]?.listId ||
          !locked.some((list) => list.id === item.listId),
      )
    ) {
      throw new Error('CONFLICT');
    }
    const movingItems = items.filter((item) => item.listId !== target.id);
    if (movingItems.length === 0) {
      return { restorePoints: [], undoToken: null };
    }

    const affectedIds = new Set([target.id, ...movingItems.map((item) => item.listId)]);
    const operationGroupId = createId();
    const restorePoints: RestorePointReference[] = [];
    for (const list of locked.filter((list) => affectedIds.has(list.id))) {
      restorePoints.push({
        listId: list.id,
        restorePointId: await createRestorePoint(
          tx,
          list,
          list.id === target.id ? 'bulk_move_destination' : 'bulk_move_source',
          operationGroupId,
        ),
      });
    }
    const options = (await routingWorkspace(tx, user.id)).aggregationOptions;
    for (const item of movingItems) {
      await moveItemWithinTransaction(tx, item, target, options);
    }
    return { restorePoints, undoToken: { restorePoints } };
  });
}

export async function setItemChecked(user: User, itemId: string, checked: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOwnedItemList(tx, itemId, user.id);
    await tx.update(shoppingListItems).set({ checked }).where(eq(shoppingListItems.id, itemId));
  });
}

/**
 * Manually re-file an item under a different aisle (#360). The choice persists,
 * so a shopper can correct a mis-categorized line (e.g. move "coconut milk"
 * from Produce to Pantry) and it stays put across sessions and devices.
 */
export async function setItemCategory(
  user: User,
  itemId: string,
  category: ShoppingCategory,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOwnedItemList(tx, itemId, user.id);
    await tx.update(shoppingListItems).set({ category }).where(eq(shoppingListItems.id, itemId));
  });
}

export async function removeItem(user: User, itemId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOwnedItemList(tx, itemId, user.id);
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId));
  });
}

export async function clearChecked(
  user: User,
  listId: string,
): Promise<{ restorePointId: string }> {
  return db.transaction(async (tx) => {
    const list = await lockOwnedList(tx, listId, user.id);
    const restorePointId = await createRestorePoint(tx, list, 'remove_completed');
    await tx
      .delete(shoppingListItems)
      .where(and(eq(shoppingListItems.listId, list.id), eq(shoppingListItems.checked, true)));
    await touchList(tx, list.id);
    return { restorePointId };
  });
}

export async function clearList(user: User, listId: string): Promise<{ restorePointId: string }> {
  return db.transaction(async (tx) => {
    const list = await lockOwnedList(tx, listId, user.id);
    const restorePointId = await createRestorePoint(tx, list, 'clear_all');
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.listId, list.id));
    await touchList(tx, list.id);
    return { restorePointId };
  });
}

export async function uncheckAll(user: User, listId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const list = await lockOwnedList(tx, listId, user.id);
    await tx
      .update(shoppingListItems)
      .set({ checked: false, updatedAt: new Date() })
      .where(and(eq(shoppingListItems.listId, list.id), eq(shoppingListItems.checked, true)));
    await touchList(tx, list.id);
  });
}

export async function restoreShoppingListPoint(
  user: User,
  listId: string,
  restorePointId: string,
): Promise<{ listId: string; restorePointId: string }> {
  return db.transaction(async (tx) => {
    const list = await lockOwnedList(tx, listId, user.id);
    const point = await tx.query.shoppingListRestorePoints.findFirst({
      where: and(
        eq(shoppingListRestorePoints.id, restorePointId),
        eq(shoppingListRestorePoints.listId, list.id),
        eq(shoppingListRestorePoints.userId, user.id),
      ),
      with: {
        items: {
          orderBy: [
            asc(shoppingListRestorePointItems.position),
            asc(shoppingListRestorePointItems.id),
          ],
        },
      },
    });
    if (!point) throw new Error('NOT_FOUND');

    const currentRestorePointId = await createRestorePoint(tx, list, 'restore');
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.listId, list.id));
    if (point.items.length > 0) {
      await tx.insert(shoppingListItems).values(
        point.items.map((item, position) => ({
          listId: list.id,
          item: item.item,
          quantity: item.quantity,
          quantityMax: item.quantityMax,
          unit: item.unit,
          requiredBaseQuantity: item.requiredBaseQuantity,
          requiredBaseQuantityMax: item.requiredBaseQuantityMax,
          requiredBaseUnit: item.requiredBaseUnit,
          purchaseQuantity: item.purchaseQuantity,
          purchaseUnit: item.purchaseUnit,
          packageCount: item.packageCount,
          packageAmount: item.packageAmount,
          packageUnit: item.packageUnit,
          packageLabel: item.packageLabel,
          category: item.category,
          note: item.note,
          optional: item.optional,
          checked: item.checked,
          recipeId: item.recipeId,
          foodId: item.foodId,
          position,
        })),
      );
    }
    await touchList(tx, list.id);
    return { listId: list.id, restorePointId: currentRestorePointId };
  });
}

/**
 * Atomically restore a multi-list undo token. Every list is locked before any
 * point is read or current state is snapshotted, so a partial restore cannot
 * commit.
 */
export async function restoreShoppingListPoints(
  user: User,
  input: RestoreShoppingListPointsInput,
): Promise<{
  restorePoints: RestorePointReference[];
  undoToken: BulkMoveUndoToken;
}> {
  return db.transaction(async (tx) => {
    const listIds = input.restorePoints.map((point) => point.listId);
    const pointIds = input.restorePoints.map((point) => point.restorePointId);
    if (
      input.restorePoints.length < 2 ||
      new Set(listIds).size !== listIds.length ||
      new Set(pointIds).size !== pointIds.length
    ) {
      throw new Error('INVALID_INPUT');
    }

    const lists = await lockOwnedLists(tx, listIds, user.id);
    const listsById = new Map(lists.map((list) => [list.id, list]));
    const snapshots: Array<{
      list: OwnedList;
      point: {
        items: (typeof shoppingListRestorePointItems.$inferSelect)[];
      };
    }> = [];

    for (const reference of input.restorePoints) {
      const list = listsById.get(reference.listId);
      if (!list) throw new Error('NOT_FOUND');
      const point = await tx.query.shoppingListRestorePoints.findFirst({
        where: and(
          eq(shoppingListRestorePoints.id, reference.restorePointId),
          eq(shoppingListRestorePoints.listId, list.id),
          eq(shoppingListRestorePoints.userId, user.id),
        ),
        with: {
          items: {
            orderBy: [
              asc(shoppingListRestorePointItems.position),
              asc(shoppingListRestorePointItems.id),
            ],
          },
        },
      });
      if (!point) throw new Error('NOT_FOUND');
      snapshots.push({ list, point });
    }

    const restorePoints: RestorePointReference[] = [];
    const operationGroupId = createId();
    for (const list of lists) {
      restorePoints.push({
        listId: list.id,
        restorePointId: await createRestorePoint(tx, list, 'restore', operationGroupId),
      });
    }

    for (const { list, point } of snapshots) {
      await tx.delete(shoppingListItems).where(eq(shoppingListItems.listId, list.id));
      if (point.items.length > 0) {
        await tx.insert(shoppingListItems).values(
          point.items.map((item, position) => ({
            listId: list.id,
            item: item.item,
            quantity: item.quantity,
            quantityMax: item.quantityMax,
            unit: item.unit,
            requiredBaseQuantity: item.requiredBaseQuantity,
            requiredBaseQuantityMax: item.requiredBaseQuantityMax,
            requiredBaseUnit: item.requiredBaseUnit,
            purchaseQuantity: item.purchaseQuantity,
            purchaseUnit: item.purchaseUnit,
            packageCount: item.packageCount,
            packageAmount: item.packageAmount,
            packageUnit: item.packageUnit,
            packageLabel: item.packageLabel,
            category: item.category,
            note: item.note,
            optional: item.optional,
            checked: item.checked,
            recipeId: item.recipeId,
            foodId: item.foodId,
            position,
          })),
        );
      }
      await touchList(tx, list.id);
    }

    return { restorePoints, undoToken: { restorePoints } };
  });
}
