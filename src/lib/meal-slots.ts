/** Meal slots in display order. Mirrors the `meal_slot` PostgreSQL enum. */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlotValue = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlotValue, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
