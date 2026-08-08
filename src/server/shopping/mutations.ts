import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { db } from "~/server/db";
import {
  mealPlanEntries,
  groupMembers,
  shoppingIngredientRouteAlternatives,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingLists,
  type User,
} from "~/server/db/schema";
import { getRecipe } from "~/server/recipes/queries";
import { parseLeftoversNote } from "~/lib/planner-batch";
import {
  categorize,
  isPantryStaple,
  mergeShoppingItems,
  toShoppingItems,
  type ShoppingCategory,
  type ShoppingItemInput,
} from "~/lib/shopping-list";
import {
  findIngredientRoute,
  ingredientRouteIdentity,
  partitionShoppingItemsByDestination,
  type ShoppingIngredientRoute,
} from "~/lib/shopping-routing";
import type {
  CreateShoppingListInput,
  ManualItemInput,
  MoveShoppingItemInput,
  RenameShoppingListInput,
} from "./validation";
import {
  planWarningsForRecipes,
  type PlanSafetyWarning,
} from "~/server/dietary/gating";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    throw new Error("NOT_FOUND");
  }
  return list;
}

async function ownedItem(tx: Tx, itemId: string, userId: string) {
  const item = await tx.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.id, itemId),
    with: { list: { columns: { userId: true } } },
  });
  if (item?.list.userId !== userId) throw new Error("NOT_FOUND");
  return item;
}

async function createFallbackList(tx: Tx, userId: string) {
  const [created] = await tx
    .insert(shoppingLists)
    .values({ userId, name: "Shopping list", isDefault: false })
    .returning({
      id: shoppingLists.id,
      userId: shoppingLists.userId,
      isDefault: shoppingLists.isDefault,
      archivedAt: shoppingLists.archivedAt,
    });
  if (!created) throw new Error("NOT_FOUND");
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
    if (!ownedListIds.has(row.listId)) throw new Error("NOT_FOUND");
    const ids = alternatives.get(row.routeId) ?? [];
    ids.push(row.listId);
    alternatives.set(row.routeId, ids);
  }

  return routeRows.map((route) => {
    if (!ownedListIds.has(route.preferredListId)) {
      throw new Error("NOT_FOUND");
    }
    return {
      id: route.id,
      foodId: route.foodId,
      normalizedItem: route.normalizedItem,
      preferredListId: route.preferredListId,
      alternativeListIds: alternatives.get(route.id) ?? [],
    };
  });
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
    await tx
      .update(shoppingLists)
      .set({ isDefault: true })
      .where(eq(shoppingLists.id, created.id));
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
  return {
    defaultListId: defaultList.id,
    activeListIds: new Set(active.map((list) => list.id)),
    routes,
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
    | "item"
    | "foodId"
    | "quantity"
    | "quantityMax"
    | "unit"
    | "optional"
    | "recipeId"
  >,
): ShoppingItemInput {
  return {
    item: item.item,
    foodId: item.foodId,
    quantity: item.quantity,
    quantityMax: item.quantityMax,
    unit: item.unit,
    optional: item.optional,
    recipeId: item.recipeId,
  };
}

async function mergeIntoList(
  tx: Tx,
  listId: string,
  contributions: ShoppingItemInput[],
) {
  const existing = await tx.query.shoppingListItems.findMany({
    where: eq(shoppingListItems.listId, listId),
  });
  const pool = existing.filter(
    (item) => !item.checked && (item.note ?? "").length === 0,
  );
  const poolInputs = pool.map(itemInput);
  const poolKeys = new Set(
    mergeShoppingItems(poolInputs).map((item) => item.key),
  );
  let added = 0;
  let merged = 0;
  for (const line of mergeShoppingItems(contributions)) {
    if (poolKeys.has(line.key)) merged++;
    else added++;
  }

  const consolidated = mergeShoppingItems([...poolInputs, ...contributions]);
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
) {
  const workspace = await routingWorkspace(tx, userId);
  const partitions = partitionShoppingItemsByDestination(
    contributions,
    workspace.routes,
    workspace.activeListIds,
    workspace.defaultListId,
  );
  let added = 0;
  let merged = 0;
  for (const [listId, items] of partitions) {
    const result = await mergeIntoList(tx, listId, items);
    added += result.added;
    merged += result.merged;
  }
  return { added, merged };
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
  if (!recipe) throw new Error("NOT_FOUND");

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
      where: and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, user.id),
      ),
      columns: { id: true },
    });
    if (!membership) throw new Error("FORBIDDEN");
  }
  const scope =
    groupId != null
      ? eq(mealPlanEntries.groupId, groupId)
      : and(
          eq(mealPlanEntries.userId, user.id),
          isNull(mealPlanEntries.groupId),
        );
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
    (e) =>
      e.recipe != null &&
      e.leftoverSourceId == null &&
      parseLeftoversNote(e.note) == null,
  );
  if (cooking.length === 0) {
    return { recipesUsed: 0, added: 0, merged: 0, empty: true, warnings: [] };
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
  const warningsByRecipe = await planWarningsForRecipes(user.id, [
    ...recipeIds,
  ]);
  const warnings = [...warningsByRecipe.values()].flat();

  if (contributions.length === 0) {
    return {
      recipesUsed: recipeIds.size,
      added: 0,
      merged: 0,
      empty: false,
      warnings,
    };
  }

  return db.transaction(async (tx) => {
    const { added, merged } = await routeContributions(
      tx,
      user.id,
      contributions,
    );
    return {
      recipesUsed: recipeIds.size,
      added,
      merged,
      empty: false,
      warnings,
    };
  });
}

/** Append a single hand-typed grocery line. */
export async function addManualItem(
  user: User,
  input: ManualItemInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const list = await ownedList(tx, input.listId, user.id, true);
    const [{ next } = { next: 0 }] = await tx
      .select({
        next: sql<number>`coalesce(max(${shoppingListItems.position}), -1) + 1`,
      })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, list.id));

    await tx.insert(shoppingListItems).values({
      listId: list.id,
      item: input.item,
      quantity: input.quantity ?? null,
      quantityMax: input.quantityMax ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      category: categorize(input.item),
      position: next,
    });
    await touchList(tx, list.id);
  });
}

export async function createShoppingList(
  user: User,
  input: CreateShoppingListInput,
) {
  return db.transaction(async (tx) => {
    const active = await tx.query.shoppingLists.findMany({
      where: and(
        eq(shoppingLists.userId, user.id),
        isNull(shoppingLists.archivedAt),
      ),
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
        storeName: input.storeName ?? null,
        isDefault,
      })
      .returning({ id: shoppingLists.id });
    if (!created) throw new Error("NOT_FOUND");
    return created;
  });
}

export async function renameShoppingList(
  user: User,
  input: RenameShoppingListInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedList(tx, input.listId, user.id);
    await tx
      .update(shoppingLists)
      .set({
        name: input.name,
        storeName: input.storeName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(shoppingLists.id, input.listId));
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
        .where(
          and(
            eq(shoppingLists.userId, user.id),
            eq(shoppingLists.isDefault, true),
          ),
        );
      await tx
        .update(shoppingLists)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(shoppingLists.id, list.id));
    }
    return { defaultListId: list.id };
  });
}

async function prepareListRemoval(
  tx: Tx,
  userId: string,
  target: OwnedList,
): Promise<string> {
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
  let activeFallbacks = lists.filter(
    (list) => list.id !== target.id && list.archivedAt == null,
  );
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
      .where(
        and(
          eq(shoppingLists.userId, userId),
          eq(shoppingLists.isDefault, true),
        ),
      );
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
    const promoted =
      route.alternativeListIds.find((id) => activeIds.has(id)) ?? fallback.id;
    await tx
      .update(shoppingIngredientRoutes)
      .set({ preferredListId: promoted, updatedAt: new Date() })
      .where(
        and(
          eq(shoppingIngredientRoutes.id, route.id),
          eq(shoppingIngredientRoutes.userId, userId),
        ),
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

export async function restoreShoppingList(
  user: User,
  listId: string,
): Promise<{ listId: string }> {
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
  item: Pick<typeof shoppingListItems.$inferSelect, "item" | "foodId">,
  preferredListId: string,
  alternativeListIds: string[],
) {
  const lists = await tx.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, userId),
    columns: { id: true },
  });
  const routes = await loadOwnedRoutes(
    tx,
    userId,
    new Set(lists.map((list) => list.id)),
  );
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
        and(
          eq(shoppingIngredientRoutes.id, routeId),
          eq(shoppingIngredientRoutes.userId, userId),
        ),
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
  if (!routeId) throw new Error("NOT_FOUND");
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

export async function moveShoppingItem(
  user: User,
  input: MoveShoppingItemInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await ownedItem(tx, input.itemId, user.id);
    const target = await ownedList(tx, input.targetListId, user.id, true);
    if (
      new Set(input.alternativeListIds).size !==
        input.alternativeListIds.length ||
      input.alternativeListIds.includes(target.id)
    ) {
      throw new Error("INVALID_INPUT");
    }
    for (const alternativeId of input.alternativeListIds) {
      await ownedList(tx, alternativeId, user.id, true);
    }

    if (item.listId !== target.id) {
      const [{ next } = { next: 0 }] = await tx
        .select({
          next: sql<number>`coalesce(max(${shoppingListItems.position}), -1) + 1`,
        })
        .from(shoppingListItems)
        .where(eq(shoppingListItems.listId, target.id));

      if (!item.checked && (item.note ?? "").length === 0) {
        const destination = await tx.query.shoppingListItems.findMany({
          where: eq(shoppingListItems.listId, target.id),
        });
        const sourceKey = mergeShoppingItems([itemInput(item)])[0]?.key;
        const compatible = destination.filter(
          (candidate) =>
            !candidate.checked &&
            (candidate.note ?? "").length === 0 &&
            mergeShoppingItems([itemInput(candidate)])[0]?.key === sourceKey,
        );
        if (compatible.length > 0) {
          const [merged] = mergeShoppingItems([
            ...compatible.map(itemInput),
            itemInput(item),
          ]);
          if (!merged) throw new Error("NOT_FOUND");
          await tx
            .delete(shoppingListItems)
            .where(
              inArray(shoppingListItems.id, [
                item.id,
                ...compatible.map((candidate) => candidate.id),
              ]),
            );
          await tx.insert(shoppingListItems).values({
            listId: target.id,
            item: merged.item,
            foodId: merged.foodId,
            quantity: merged.quantity,
            quantityMax: merged.quantityMax,
            unit: merged.unit,
            category:
              compatible[0]?.category ?? item.category ?? merged.category,
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

    if (input.rememberRoute) {
      await saveItemRoute(
        tx,
        user.id,
        item,
        target.id,
        input.alternativeListIds,
      );
    }
  });
}

export async function setItemChecked(
  user: User,
  itemId: string,
  checked: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedItem(tx, itemId, user.id);
    await tx
      .update(shoppingListItems)
      .set({ checked })
      .where(eq(shoppingListItems.id, itemId));
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
    await ownedItem(tx, itemId, user.id);
    await tx
      .update(shoppingListItems)
      .set({ category })
      .where(eq(shoppingListItems.id, itemId));
  });
}

export async function removeItem(user: User, itemId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedItem(tx, itemId, user.id);
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId));
  });
}

export async function clearChecked(user: User, listId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const list = await ownedList(tx, listId, user.id);
    await tx
      .delete(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.listId, list.id),
          eq(shoppingListItems.checked, true),
        ),
      );
  });
}

export async function clearList(user: User, listId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const list = await ownedList(tx, listId, user.id);
    await tx
      .delete(shoppingListItems)
      .where(eq(shoppingListItems.listId, list.id));
  });
}
