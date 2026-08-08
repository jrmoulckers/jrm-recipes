import { z } from "zod";

import { SHOPPING_CATEGORIES } from "~/lib/shopping-list";
import { dateParam } from "~/server/planner/validation";

/**
 * Validation contract for shopping-list input, shared by the client UI and the
 * server actions so the shape is guaranteed end to end. Mirrors the recipe
 * validation helpers (empty form fields coerce to `undefined`).
 */

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v));

/** A nullable, coercible non-negative number from a possibly-empty form field. */
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

const entityId = z.string().trim().min(1).max(24);

/** A manually added grocery line. */
export const manualItemInput = z.object({
  listId: entityId,
  item: z.string().trim().min(1, "Add an item").max(300),
  quantity: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
  quantityMax: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
  unit: optionalString(40),
  note: optionalString(300),
});

/** Add a recipe's (optionally rescaled) ingredients to the list. */
export const addRecipeToListInput = z.object({
  recipeId: entityId,
  desiredServings: optionalNumber.pipe(
    z.number().int().min(1).max(1000).optional(),
  ),
  /** Keep pantry staples (salt, oil, …) instead of skipping them (#412). */
  includeStaples: z.boolean().optional(),
});

/** Build a personal shopping list from a personal or shared planner week. */
export const buildFromPlanInput = z.object({
  week: dateParam,
  groupId: z.string().trim().min(1).max(24).optional(),
});

/** Override the aisle (category) an item is filed under (#360). */
export const setItemCategoryInput = z.object({
  itemId: entityId,
  category: z.enum(SHOPPING_CATEGORIES as unknown as [string, ...string[]]),
});

export const listIdInput = z.object({ listId: entityId });
export const itemIdInput = z.object({ itemId: entityId });
export const setItemCheckedInput = itemIdInput.extend({
  checked: z.boolean(),
});

export const createShoppingListInput = z.object({
  name: z.string().trim().min(1).max(120),
  storeName: optionalString(120),
});

export const renameShoppingListInput = createShoppingListInput.extend({
  listId: entityId,
});

export const moveShoppingItemInput = z
  .object({
    itemId: entityId,
    targetListId: entityId,
    rememberRoute: z.boolean().optional(),
    alternativeListIds: z.array(entityId).max(20).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.alternativeListIds).size !== value.alternativeListIds.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativeListIds"],
        message: "Choose each alternative once.",
      });
    }
    if (value.alternativeListIds.includes(value.targetListId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativeListIds"],
        message: "The preferred list cannot also be an alternative.",
      });
    }
  });

export type ManualItemInput = z.infer<typeof manualItemInput>;
export type AddRecipeToListInput = z.infer<typeof addRecipeToListInput>;
export type BuildFromPlanInput = z.infer<typeof buildFromPlanInput>;
export type SetItemCategoryInput = z.infer<typeof setItemCategoryInput>;
export type ListIdInput = z.infer<typeof listIdInput>;
export type SetItemCheckedInput = z.infer<typeof setItemCheckedInput>;
export type CreateShoppingListInput = z.infer<typeof createShoppingListInput>;
export type RenameShoppingListInput = z.infer<typeof renameShoppingListInput>;
export type MoveShoppingItemInput = z.infer<typeof moveShoppingItemInput>;
