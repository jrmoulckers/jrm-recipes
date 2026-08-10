import { isValid, parse } from 'date-fns';
import { z } from 'zod';

/**
 * Validation contract for the weekly meal planner. Shared by the client picker
 * and the server actions so the shape is guaranteed end to end. Depends only on
 * zod + date-fns, so it is safe to import from client components.
 */

/** Meal slots in display order. Mirrors the `meal_slot` pg enum. */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlotValue = (typeof MEAL_SLOTS)[number];

export const mealSlotSchema = z.enum(MEAL_SLOTS);

export const MEAL_SLOT_LABELS: Record<MealSlotValue, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const idInput = z.string().trim().min(1).max(24);

/** A `yyyy-MM-dd` calendar date that parses to a real day. */
export const dateParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .refine((value) => isValid(parse(value, 'yyyy-MM-dd', new Date())), {
    message: 'Enter a valid date',
  });

const noteInput = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => (value == null || value.length === 0 ? undefined : value));

const positionInput = z.number().int().min(0).max(1000).optional();
export const servingsInput = z.number().int().min(1).max(100000);

export const addEntryInput = z
  .object({
    date: dateParam,
    slot: mealSlotSchema,
    recipeId: idInput.optional(),
    groupId: idInput.optional(),
    note: noteInput,
    position: positionInput,
    servings: servingsInput.optional(),
  })
  .refine((value) => Boolean(value.recipeId) || Boolean(value.note), {
    message: 'Pick a recipe or add a note',
    path: ['recipeId'],
  })
  .refine((value) => value.servings == null || Boolean(value.recipeId), {
    message: 'Servings require a recipe',
    path: ['servings'],
  });

export const moveEntryInput = z.object({
  entryId: idInput,
  date: dateParam,
  slot: mealSlotSchema,
  position: positionInput,
});

export const removeEntryInput = z.object({
  entryId: idInput,
  removeAllocations: z.boolean().optional(),
});

export const copyWeekInput = z.object({
  week: dateParam,
  groupId: idInput.optional(),
});

export const leftoverAllocationInput = z.object({
  date: dateParam,
  slot: mealSlotSchema,
  servings: servingsInput,
});

/** A cooked meal plus exact serving allocations for linked leftover meals. */
export const mealWithLeftoversInput = z
  .object({
    date: dateParam,
    slot: mealSlotSchema,
    recipeId: idInput,
    groupId: idInput.optional(),
    note: noteInput,
    mealServings: servingsInput,
    leftovers: z.array(leftoverAllocationInput).min(1).max(28),
  })
  .superRefine((value, context) => {
    const destinations = new Set<string>();
    const sourceSlotIndex = MEAL_SLOTS.indexOf(value.slot);
    value.leftovers.forEach((allocation, index) => {
      const destination = `${allocation.date}|${allocation.slot}`;
      const isAfterSource =
        allocation.date > value.date ||
        (allocation.date === value.date && MEAL_SLOTS.indexOf(allocation.slot) > sourceSlotIndex);
      if (!isAfterSource) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Schedule leftovers after the source meal',
          path: ['leftovers', index, 'date'],
        });
      }
      if (destinations.has(destination)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each leftovers meal must be unique',
          path: ['leftovers', index, 'date'],
        });
      }
      destinations.add(destination);
    });
  });

export type AddEntryInput = z.infer<typeof addEntryInput>;
export type MoveEntryInput = z.infer<typeof moveEntryInput>;
export type RemoveEntryInput = z.infer<typeof removeEntryInput>;
export type CopyWeekInput = z.infer<typeof copyWeekInput>;
export type LeftoverAllocationInput = z.infer<typeof leftoverAllocationInput>;
export type MealWithLeftoversInput = z.infer<typeof mealWithLeftoversInput>;
