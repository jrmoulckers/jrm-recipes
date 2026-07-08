"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { HOUSEHOLD_COOKIE, parseHousehold } from "~/config/household";
import {
  addManualItem,
  addRecipeToList,
  clearChecked,
  clearList,
  removeItem,
  setItemChecked,
} from "./mutations";
import {
  addRecipeToListInput,
  manualItemInput,
  type AddRecipeToListInput,
  type ManualItemInput,
} from "./validation";

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
