import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  mealPlanEntries,
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
import type { ManualItemInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ensureListId(tx: Tx, userId: string): Promise<string> {
  const existing = await tx.query.shoppingLists.findFirst({
    where: eq(shoppingLists.userId, userId),
    orderBy: [desc(shoppingLists.updatedAt)],
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [created] = await tx
    .insert(shoppingLists)
    .values({ userId })
    .returning({ id: shoppingLists.id });
  return created!.id;
}

function touchList(tx: Tx, listId: string) {
  return tx
    .update(shoppingLists)
    .set({ updatedAt: new Date() })
    .where(eq(shoppingLists.id, listId));
}

async function userListIds(userId: string): Promise<string[]> {
  const lists = await db.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, userId),
    columns: { id: true },
  });
  return lists.map((l) => l.id);
}

/**
 * Add a recipe's ingredients (scaled to `desiredServings`) to the user's list,
 * re-consolidating with the existing unchecked, un-noted items so quantities
 * combine unit-aware. Checked items and manually-noted items are left intact.
 *
 * Pantry staples (salt, oil, …) are skipped by default so the list stays short
 * (#412); pass `includeStaples` to keep them.
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
      quantity: ing.quantity,
      quantityMax: ing.quantityMax,
      unit: ing.unit,
      optional: ing.optional,
    })),
  }).filter((item) => includeStaples || !isPantryStaple(item.item));
  if (contributions.length === 0) return;

  await db.transaction(async (tx) => {
    const listId = await ensureListId(tx, user.id);
    const existing = await tx.query.shoppingListItems.findMany({
      where: eq(shoppingListItems.listId, listId),
    });

    const pool = existing.filter(
      (i) => !i.checked && (i.note ?? "").length === 0,
    );

    const poolInputs: ShoppingItemInput[] = pool.map((i) => ({
      item: i.item,
      quantity: i.quantity,
      quantityMax: i.quantityMax,
      unit: i.unit,
      recipeId: i.recipeId,
    }));

    const merged = mergeShoppingItems([...poolInputs, ...contributions]);

    if (pool.length > 0) {
      await tx.delete(shoppingListItems).where(
        inArray(
          shoppingListItems.id,
          pool.map((i) => i.id),
        ),
      );
    }

    if (merged.length > 0) {
      await tx.insert(shoppingListItems).values(
        merged.map((m, idx) => ({
          listId,
          item: m.item,
          quantity: m.quantity,
          quantityMax: m.quantityMax,
          unit: m.unit,
          category: m.category,
          recipeId: m.recipeIds[0] ?? null,
          position: idx,
        })),
      );
    }

    await touchList(tx, listId);
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
  includeStaples = false,
): Promise<BuildFromPlanResult> {
  const entries = await db.query.mealPlanEntries.findMany({
    where: and(
      eq(mealPlanEntries.userId, user.id),
      isNotNull(mealPlanEntries.recipeId),
      gte(mealPlanEntries.date, startDate),
      lte(mealPlanEntries.date, endDate),
    ),
    columns: { recipeId: true, note: true },
    with: {
      recipe: {
        columns: { id: true, servings: true },
        with: {
          ingredients: {
            columns: {
              item: true,
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
  // batch-cooked meal isn't shopped for twice; cooking the same recipe on two
  // separate nights DOES contribute twice (quantities combine below).
  const cooking = entries.filter(
    (e) => e.recipe != null && parseLeftoversNote(e.note) == null,
  );
  if (cooking.length === 0) {
    return { recipesUsed: 0, added: 0, merged: 0, empty: true };
  }

  const contributions: ShoppingItemInput[] = [];
  const recipeIds = new Set<string>();
  for (const entry of cooking) {
    const recipe = entry.recipe!;
    recipeIds.add(recipe.id);
    const items = toShoppingItems({
      recipeId: recipe.id,
      servings: recipe.servings,
      desiredServings: recipe.servings ?? undefined,
      ingredients: recipe.ingredients.map((ing) => ({
        item: ing.item,
        quantity: ing.quantity,
        quantityMax: ing.quantityMax,
        unit: ing.unit,
        optional: ing.optional,
      })),
    }).filter((item) => includeStaples || !isPantryStaple(item.item));
    contributions.push(...items);
  }

  if (contributions.length === 0) {
    return { recipesUsed: recipeIds.size, added: 0, merged: 0, empty: false };
  }

  return db.transaction(async (tx) => {
    const listId = await ensureListId(tx, user.id);
    const existing = await tx.query.shoppingListItems.findMany({
      where: eq(shoppingListItems.listId, listId),
    });

    const pool = existing.filter(
      (i) => !i.checked && (i.note ?? "").length === 0,
    );
    const poolInputs: ShoppingItemInput[] = pool.map((i) => ({
      item: i.item,
      quantity: i.quantity,
      quantityMax: i.quantityMax,
      unit: i.unit,
      recipeId: i.recipeId,
    }));

    // Summary: which incoming lines are brand-new vs. merged into an existing
    // line. Computed from the same keying the merge uses, so it's exact.
    const poolKeys = new Set(mergeShoppingItems(poolInputs).map((m) => m.key));
    let added = 0;
    let merged = 0;
    for (const line of mergeShoppingItems(contributions)) {
      if (poolKeys.has(line.key)) merged++;
      else added++;
    }

    const mergedItems = mergeShoppingItems([...poolInputs, ...contributions]);

    if (pool.length > 0) {
      await tx.delete(shoppingListItems).where(
        inArray(
          shoppingListItems.id,
          pool.map((i) => i.id),
        ),
      );
    }

    if (mergedItems.length > 0) {
      await tx.insert(shoppingListItems).values(
        mergedItems.map((m, idx) => ({
          listId,
          item: m.item,
          quantity: m.quantity,
          quantityMax: m.quantityMax,
          unit: m.unit,
          category: m.category,
          recipeId: m.recipeIds[0] ?? null,
          position: idx,
        })),
      );
    }

    await touchList(tx, listId);
    return { recipesUsed: recipeIds.size, added, merged, empty: false };
  });
}

/** Append a single hand-typed grocery line. */
export async function addManualItem(
  user: User,
  input: ManualItemInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const listId = await ensureListId(tx, user.id);
    const [{ next } = { next: 0 }] = await tx
      .select({
        next: sql<number>`coalesce(max(${shoppingListItems.position}), -1) + 1`,
      })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, listId));

    await tx.insert(shoppingListItems).values({
      listId,
      item: input.item,
      quantity: input.quantity ?? null,
      quantityMax: input.quantityMax ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      category: categorize(input.item),
      position: next,
    });
    await touchList(tx, listId);
  });
}

async function ownedItem(itemId: string, userId: string) {
  const item = await db.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.id, itemId),
    with: { list: { columns: { userId: true } } },
  });
  if (item?.list.userId !== userId) throw new Error("NOT_FOUND");
  return item;
}

export async function setItemChecked(
  user: User,
  itemId: string,
  checked: boolean,
): Promise<void> {
  await ownedItem(itemId, user.id);
  await db
    .update(shoppingListItems)
    .set({ checked })
    .where(eq(shoppingListItems.id, itemId));
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
  await ownedItem(itemId, user.id);
  await db
    .update(shoppingListItems)
    .set({ category })
    .where(eq(shoppingListItems.id, itemId));
}

export async function removeItem(user: User, itemId: string): Promise<void> {
  await ownedItem(itemId, user.id);
  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId));
}

export async function clearChecked(user: User): Promise<void> {
  const ids = await userListIds(user.id);
  if (ids.length === 0) return;
  await db
    .delete(shoppingListItems)
    .where(
      and(
        inArray(shoppingListItems.listId, ids),
        eq(shoppingListItems.checked, true),
      ),
    );
}

export async function clearList(user: User): Promise<void> {
  const ids = await userListIds(user.id);
  if (ids.length === 0) return;
  await db
    .delete(shoppingListItems)
    .where(inArray(shoppingListItems.listId, ids));
}
