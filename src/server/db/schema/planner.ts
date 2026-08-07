import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

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
 * so a slot can hold just a note. `groupId` is nullable so a plan can optionally
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
    plannedServings: integer(),
    servingsMade: integer(),
    leftoverSourceId: fk().references((): AnyPgColumn => mealPlanEntries.id, {
      onDelete: "set null",
    }),
    note: varchar({ length: 300 }),
    position: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("meal_plan_entries_user_date_idx").on(t.userId, t.date),
    index("meal_plan_entries_recipe_idx").on(t.recipeId),
    index("meal_plan_entries_group_idx").on(t.groupId),
    index("meal_plan_entries_leftover_source_idx").on(t.leftoverSourceId),
    check(
      "meal_plan_entries_planned_servings_check",
      sql`${t.plannedServings} is null or ${t.plannedServings} > 0`,
    ),
    check(
      "meal_plan_entries_servings_made_check",
      sql`${t.servingsMade} is null or ${t.servingsMade} > 0`,
    ),
    check(
      "meal_plan_entries_servings_allocation_check",
      sql`${t.servingsMade} is null or ${t.plannedServings} is null or ${t.servingsMade} >= ${t.plannedServings}`,
    ),
  ],
);

export const mealPlanEntriesRelations = relations(
  mealPlanEntries,
  ({ one, many }) => ({
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
    leftoverSource: one(mealPlanEntries, {
      fields: [mealPlanEntries.leftoverSourceId],
      references: [mealPlanEntries.id],
      relationName: "mealLeftoverAllocations",
    }),
    leftoverAllocations: many(mealPlanEntries, {
      relationName: "mealLeftoverAllocations",
    }),
  }),
);

export type MealPlanEntry = typeof mealPlanEntries.$inferSelect;
export type NewMealPlanEntry = typeof mealPlanEntries.$inferInsert;
export type MealSlot = (typeof mealSlot.enumValues)[number];
