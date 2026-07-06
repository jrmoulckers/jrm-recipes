import { z } from "zod";

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

/** A manually added grocery line. */
export const manualItemInput = z.object({
  item: z.string().trim().min(1, "Add an item").max(300),
  quantity: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
  quantityMax: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
  unit: optionalString(40),
  note: optionalString(300),
});

/** Add a recipe's (optionally rescaled) ingredients to the list. */
export const addRecipeToListInput = z.object({
  recipeId: z.string().trim().min(1, "Recipe is required").max(24),
  desiredServings: optionalNumber.pipe(
    z.number().int().min(1).max(1000).optional(),
  ),
});

export type ManualItemInput = z.infer<typeof manualItemInput>;
export type AddRecipeToListInput = z.infer<typeof addRecipeToListInput>;
