"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { type PlanSafetyWarning } from "~/server/dietary/gating";
import { HOUSEHOLD_COOKIE, parseHousehold } from "~/config/household";
import {
  addManualItem,
  addRecipeToList,
  archiveShoppingList,
  bulkMoveShoppingItems,
  buildListFromPlan,
  clearChecked,
  clearList,
  createShoppingList,
  deleteShoppingList,
  makeShoppingListDefault,
  moveShoppingItem,
  removeItem,
  renameShoppingList,
  restoreShoppingList,
  restoreShoppingListPoint,
  restoreShoppingListPoints,
  saveIngredientPackage,
  setItemCategory,
  setItemChecked,
  uncheckAll,
  type BulkMoveUndoToken,
  type RestorePointReference,
} from "./mutations";
import {
  getShoppingListHistory,
  type ShoppingListHistoryPoint,
} from "./queries";
import {
  addRecipeToListInput,
  bulkMoveShoppingItemsInput,
  buildFromPlanInput,
  createShoppingListInput,
  itemIdInput,
  listIdInput,
  manualItemInput,
  moveShoppingItemInput,
  renameShoppingListInput,
  restoreShoppingListPointInput,
  restoreShoppingListPointsInput,
  saveIngredientPackageInput,
  setItemCategoryInput,
  setItemCheckedInput,
  type AddRecipeToListInput,
  type BuildFromPlanInput,
  type BulkMoveShoppingItemsInput,
  type CreateShoppingListInput,
  type ListIdInput,
  type ManualItemInput,
  type MoveShoppingItemInput,
  type RenameShoppingListInput,
  type RestoreShoppingListPointInput,
  type RestoreShoppingListPointsInput,
  type SaveIngredientPackageInput,
} from "./validation";
import { type ShoppingCategory } from "~/lib/shopping-list";
import {
  getPlannerWeek,
  parseDateParam,
  toDateParam,
} from "~/server/planner/week";

export type { BulkMoveUndoToken, RestorePointReference };

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
type ActionFailure = Extract<ActionResult, { ok: false }>;
export type CreateShoppingListActionResult =
  { ok: true; id: string; listId: string } | ActionFailure;
export type MakeShoppingListDefaultActionResult =
  { ok: true; defaultListId: string } | ActionFailure;
export type UnavailableShoppingListActionResult =
  { ok: true; fallbackListId: string } | ActionFailure;
export type RestoreShoppingListActionResult =
  { ok: true; listId: string } | ActionFailure;
export type RestorePointActionResult =
  { ok: true; restorePointId: string } | ActionFailure;
export type BulkMoveShoppingItemsActionResult =
  | {
      ok: true;
      restorePoints: RestorePointReference[];
      undoToken: BulkMoveUndoToken | null;
    }
  | ActionFailure;
export type RestoreShoppingListPointsActionResult =
  | {
      ok: true;
      restorePoints: RestorePointReference[];
      undoToken: BulkMoveUndoToken;
    }
  | ActionFailure;
export type ShoppingListHistoryActionResult =
  { ok: true; history: ShoppingListHistoryPoint[] } | ActionFailure;

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
  | {
      ok: true;
      recipesUsed: number;
      added: number;
      merged: number;
      empty: boolean;
      warnings: PlanSafetyWarning[];
      restorePoints: RestorePointReference[];
    }
  | { ok: false; error: string };

/**
 * Build the shopping list from the meal plan for the week containing `week`
 * (#361). Mirrors the planner page's week calculation so the list reflects
 * exactly the visible week.
 */
export async function buildListFromPlanAction(
  input: BuildFromPlanInput,
): Promise<BuildFromPlanActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = buildFromPlanInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please choose a valid planner week." };
  }
  const user = await requireUser();
  try {
    const locale = await getLocale();
    const { start, end } = getPlannerWeek(
      parseDateParam(parsed.data.week),
      locale,
    );
    const result = await buildListFromPlan(
      user,
      toDateParam(start),
      toDateParam(end),
      parsed.data.groupId,
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
  const parsed = setItemCheckedInput.safeParse({ itemId, checked });
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    await setItemChecked(user, parsed.data.itemId, parsed.data.checked);
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
  const parsed = itemIdInput.safeParse({ itemId });
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    await removeItem(user, parsed.data.itemId);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function clearCheckedItemsAction(
  input: ListIdInput,
): Promise<RestorePointActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = listIdInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    const result = await clearChecked(user, parsed.data.listId);
    revalidatePath("/shopping");
    return { ok: true, restorePointId: result.restorePointId };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function clearShoppingListAction(
  input: ListIdInput,
): Promise<RestorePointActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = listIdInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    const result = await clearList(user, parsed.data.listId);
    revalidatePath("/shopping");
    return { ok: true, restorePointId: result.restorePointId };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function uncheckAllShoppingItemsAction(
  input: ListIdInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = listIdInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    await uncheckAll(user, parsed.data.listId);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function createShoppingListAction(
  input: CreateShoppingListInput,
): Promise<CreateShoppingListActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = createShoppingListInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    const created = await createShoppingList(user, parsed.data);
    revalidatePath("/shopping");
    return { ok: true, id: created.id, listId: created.id };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function renameShoppingListAction(
  input: RenameShoppingListInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = renameShoppingListInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    await renameShoppingList(user, parsed.data);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

async function runListAction<TResult, TSuccess extends { ok: true }>(
  input: ListIdInput,
  mutation: (
    user: Awaited<ReturnType<typeof requireUser>>,
    listId: string,
  ) => Promise<TResult>,
  success: (result: TResult) => TSuccess,
): Promise<TSuccess | ActionFailure> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = listIdInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    const result = await mutation(user, parsed.data.listId);
    revalidatePath("/shopping");
    return success(result);
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function makeShoppingListDefaultAction(
  input: ListIdInput,
): Promise<MakeShoppingListDefaultActionResult> {
  return runListAction(input, makeShoppingListDefault, (result) => ({
    ok: true,
    defaultListId: result.defaultListId,
  }));
}

export async function archiveShoppingListAction(
  input: ListIdInput,
): Promise<UnavailableShoppingListActionResult> {
  return runListAction(input, archiveShoppingList, (result) => ({
    ok: true,
    fallbackListId: result.fallbackListId,
  }));
}

export async function restoreShoppingListAction(
  input: ListIdInput,
): Promise<RestoreShoppingListActionResult> {
  return runListAction(input, restoreShoppingList, (result) => ({
    ok: true,
    listId: result.listId,
  }));
}

export async function deleteShoppingListAction(
  input: ListIdInput,
): Promise<UnavailableShoppingListActionResult> {
  return runListAction(input, deleteShoppingList, (result) => ({
    ok: true,
    fallbackListId: result.fallbackListId,
  }));
}

export async function moveShoppingItemAction(
  input: MoveShoppingItemInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = moveShoppingItemInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    await moveShoppingItem(user, parsed.data);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function bulkMoveShoppingItemsAction(
  input: BulkMoveShoppingItemsInput,
): Promise<BulkMoveShoppingItemsActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = bulkMoveShoppingItemsInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    const result = await bulkMoveShoppingItems(user, parsed.data);
    revalidatePath("/shopping");
    return {
      ok: true,
      restorePoints: result.restorePoints,
      undoToken: result.undoToken,
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function saveIngredientPackageAction(
  input: SaveIngredientPackageInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = saveIngredientPackageInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    await saveIngredientPackage(user, parsed.data);
    revalidatePath("/shopping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function restoreShoppingListPointsAction(
  input: RestoreShoppingListPointsInput,
): Promise<RestoreShoppingListPointsActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = restoreShoppingListPointsInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await requireUser();
  try {
    const result = await restoreShoppingListPoints(user, parsed.data);
    revalidatePath("/shopping");
    return {
      ok: true,
      restorePoints: result.restorePoints,
      undoToken: result.undoToken,
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function restoreShoppingListPointAction(
  input: RestoreShoppingListPointInput,
): Promise<RestorePointActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = restoreShoppingListPointInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    const result = await restoreShoppingListPoint(
      user,
      parsed.data.listId,
      parsed.data.restorePointId,
    );
    revalidatePath("/shopping");
    return { ok: true, restorePointId: result.restorePointId };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function getShoppingListHistoryAction(
  input: ListIdInput,
): Promise<ShoppingListHistoryActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };
  const parsed = listIdInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that item." };
  }
  const user = await requireUser();
  try {
    const history = await getShoppingListHistory(user, parsed.data.listId);
    return { ok: true, history: history ?? [] };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
