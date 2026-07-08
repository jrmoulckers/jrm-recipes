import { isValid, parse } from "date-fns";
import { z } from "zod";

/**
 * Validation contract for the weekly meal planner. Shared by the client picker
 * and the server actions so the shape is guaranteed end to end. Depends only on
 * zod + date-fns, so it is safe to import from client components.
 */

/** Meal slots in display order. Mirrors the `meal_slot` pg enum. */
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlotValue = (typeof MEAL_SLOTS)[number];

export const mealSlotSchema = z.enum(MEAL_SLOTS);

export const MEAL_SLOT_LABELS: Record<MealSlotValue, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const idInput = z.string().trim().min(1).max(24);

/** A `yyyy-MM-dd` calendar date that parses to a real day. */
export const dateParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => isValid(parse(value, "yyyy-MM-dd", new Date())), {
    message: "Enter a valid date",
  });

const noteInput = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => (value == null || value.length === 0 ? undefined : value));

const positionInput = z.number().int().min(0).max(1000).optional();

export const addEntryInput = z
  .object({
    date: dateParam,
    slot: mealSlotSchema,
    recipeId: idInput.optional(),
    groupId: idInput.optional(),
    note: noteInput,
    position: positionInput,
  })
  .refine((value) => Boolean(value.recipeId) || Boolean(value.note), {
    message: "Pick a recipe or add a note",
    path: ["recipeId"],
  });

export const moveEntryInput = z.object({
  entryId: idInput,
  date: dateParam,
  slot: mealSlotSchema,
  position: positionInput,
});

export const removeEntryInput = z.object({
  entryId: idInput,
});

export const copyWeekInput = z.object({
  week: dateParam,
});

/** Servings multiple for a batch cook (#380). */
export const batchMultipleSchema = z.union([z.literal(2), z.literal(3)]);

/**
 * Batch cook: create a primary recipe entry plus a linked leftovers entry on a
 * second day. Reuses the same recipe + note columns as a normal entry (#380).
 */
export const batchCookInput = z
  .object({
    date: dateParam,
    slot: mealSlotSchema,
    recipeId: idInput,
    groupId: idInput.optional(),
    note: noteInput,
    leftoversDate: dateParam,
    multiple: batchMultipleSchema,
  })
  .refine((value) => value.leftoversDate !== value.date, {
    message: "Pick a different night for the leftovers",
    path: ["leftoversDate"],
  });

export type AddEntryInput = z.infer<typeof addEntryInput>;
export type MoveEntryInput = z.infer<typeof moveEntryInput>;
export type RemoveEntryInput = z.infer<typeof removeEntryInput>;
export type CopyWeekInput = z.infer<typeof copyWeekInput>;
export type BatchCookInput = z.infer<typeof batchCookInput>;
export type BatchMultipleValue = z.infer<typeof batchMultipleSchema>;
