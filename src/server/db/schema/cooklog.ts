import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

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
    ...timestamps(),
  },
  (t) => [
    index("cook_log_entries_recipe_idx").on(t.recipeId),
    index("cook_log_entries_user_idx").on(t.userId),
    // Fast "my recent cooks" feed (newest first per user).
    index("cook_log_entries_user_cooked_idx").on(t.userId, t.cookedAt),
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
