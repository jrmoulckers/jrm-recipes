"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { HOUSEHOLD_COOKIE, parseHousehold } from "~/config/household";
import {
  addManualItem,
  addRecipeToList,
  buildListFromPlan,
  clearChecked,
  clearList,
  removeItem,
  setItemCategory,
  setItemChecked,
} from "./mutations";
import {
  addRecipeToListInput,
  manualItemInput,
  setItemCategoryInput,
  type AddRecipeToListInput,
  type ManualItemInput,
} from "./validation";
import { type ShoppingCategory } from "~/lib/shopping-list";
import {
  getPlannerWeek,
  parseDateParam,
  toDateParam,
} from "~/server/planner/week";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  "Set DATABASE_URL (see .env.example) to sync your shopping list across devices. Until then it lives in this browser.";

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "NOT_FOUND":
      return "We couldn't find that item.";
    case "UNAUTHENTICATED":
      return "Sign in to use a synced shopping list.";
    default:
      return "We couldn't update your shopping list. Please try again.";
  }
}

export async function addRecipeToShoppingListAction(
  input: AddRecipeToListInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = addRecipeToListInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please choose a recipe and servings.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    // Fall back to the saved household size when the caller didn't pass an
    // explicit servings count, so lists scale to the family by default (#399).
    let desiredServings = parsed.data.desiredServings;
    if (desiredServings == null) {
      const store = await cookies();
      desiredServings =
        parseHousehold(store.get(HOUSEHOLD_COOKIE)?.value) ?? undefined;
    }
    await addRecipeToList(
      user,
      parsed.data.recipeId,
      desiredServings,
      parsed.data.includeStaples,
    );
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export type BuildFromPlanActionResult =
  | { ok: true; recipesUsed: number; added: number; merged: number; empty: boolean }
  | { ok: false; error: string };

/**
 * Build the shopping list from the meal plan for the week containing `week`
 * (#361). Mirrors the planner page's week calculation so the list reflects
 * exactly the visible week.
 */
export async function buildListFromPlanAction(
  week: string,
): Promise<BuildFromPlanActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const user = await requireUser();
  try {
    const locale = await getLocale();
    const { start, end } = getPlannerWeek(parseDateParam(week), locale);
    const result = await buildListFromPlan(
      user,
      toDateParam(start),
      toDateParam(end),
    );
    revalidatePath("/shopping");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function addManualItemAction(
  input: ManualItemInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = manualItemInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    await addManualItem(user, parsed.data);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function setItemCheckedAction(
  itemId: string,
  checked: boolean,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const user = await requireUser();
  try {
    await setItemChecked(user, itemId, checked);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function setItemCategoryAction(
  itemId: string,
  category: ShoppingCategory,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = setItemCategoryInput.safeParse({ itemId, category });
  if (!parsed.success) {
    return { ok: false, error: "That aisle isn't valid." };
  }
  const user = await requireUser();
  try {
    await setItemCategory(
      user,
      parsed.data.itemId,
      parsed.data.category as ShoppingCategory,
    );
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function removeShoppingItemAction(
  itemId: string,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const user = await requireUser();
  try {
    await removeItem(user, itemId);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function clearCheckedItemsAction(): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const user = await requireUser();
  try {
    await clearChecked(user);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function clearShoppingListAction(): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const user = await requireUser();
  try {
    await clearList(user);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
