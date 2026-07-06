import { relations } from "drizzle-orm";
import { date, index, integer, pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";
import { recipes } from "./recipes";

/** The meals a day is divided into on the weekly planner. */
export const mealSlot = pgEnum("meal_slot", [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
]);

/**
 * A single assignment of a recipe (or a free-form note like "leftovers") to a
 * day + meal slot on a user's weekly plan. `date` is a calendar date with no
 * time component so a plan never drifts across timezones. `recipeId` is nullable
 * so a slot can hold just a note; `groupId` is nullable so a plan can optionally
 * be scoped to a family group.
 */
export const mealPlanEntries = pgTable(
  "meal_plan_entries",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: fk().references(() => groups.id, { onDelete: "set null" }),
    date: date({ mode: "string" }).notNull(),
    slot: mealSlot().notNull(),
    recipeId: fk().references(() => recipes.id, { onDelete: "cascade" }),
    note: varchar({ length: 300 }),
    position: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("meal_plan_entries_user_date_idx").on(t.userId, t.date),
    index("meal_plan_entries_recipe_idx").on(t.recipeId),
    index("meal_plan_entries_group_idx").on(t.groupId),
  ],
);

export const mealPlanEntriesRelations = relations(mealPlanEntries, ({ one }) => ({
  user: one(users, {
    fields: [mealPlanEntries.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [mealPlanEntries.groupId],
    references: [groups.id],
  }),
  recipe: one(recipes, {
    fields: [mealPlanEntries.recipeId],
    references: [recipes.id],
  }),
}));

export type MealPlanEntry = typeof mealPlanEntries.$inferSelect;
export type NewMealPlanEntry = typeof mealPlanEntries.$inferInsert;
export type MealSlot = (typeof mealSlot.enumValues)[number];
