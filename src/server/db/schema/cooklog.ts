import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";
import { groups } from "./groups";

/**
 * A single "I cooked this" entry — one row each time a user makes a recipe.
 * Leans into Heirloom's "history, kept alive" theme: a personal, dated trail
 * of every time a dish actually hit the table, with an optional note + photo.
 */
export const cookLogEntries = pgTable(
  "cook_log_entries",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // When the cook happened. Defaults to now, but can be backdated.
    cookedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    note: text(),
    photoUrl: varchar({ length: 2048 }),
    servingsMade: integer(),
    // Share to family (issue #352): when set, this cook is shared to the given
    // group and surfaces in that group's activity feed + the recipe's "Made by
    // your family" strip. NULL keeps the cook private to the cook.
    sharedToGroupId: fk().references(() => groups.id, { onDelete: "set null" }),
    // Moderation hide (issue #357): a set timestamp removes this from member
    // (and always kid) views. `hiddenBy` records the actioning moderator.
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenBy: fk().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("cook_log_entries_recipe_idx").on(t.recipeId),
    index("cook_log_entries_user_idx").on(t.userId),
    // Fast "my recent cooks" feed (newest first per user).
    index("cook_log_entries_user_cooked_idx").on(t.userId, t.cookedAt),
    // Fast "cooks shared to this family" feed for the group activity view.
    index("cook_log_entries_shared_group_idx").on(t.sharedToGroupId),
  ],
);

export const cookLogEntriesRelations = relations(cookLogEntries, ({ one }) => ({
  recipe: one(recipes, {
    fields: [cookLogEntries.recipeId],
    references: [recipes.id],
  }),
  user: one(users, {
    fields: [cookLogEntries.userId],
    references: [users.id],
  }),
}));

export type CookLogEntry = typeof cookLogEntries.$inferSelect;
export type NewCookLogEntry = typeof cookLogEntries.$inferInsert;
