import { relations } from "drizzle-orm";
import { index, pgTable, text, unique, varchar } from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";

/**
 * A user's saved recipe search — a friendly name plus the normalized recipe
 * querystring (`q=&cuisine=&tag=&sort=...`). Applying one just restores those
 * params, so no result state is stored. Unique per (user, name) so re-saving a
 * name updates it instead of piling up duplicates.
 */
export const savedSearches = pgTable(
  "saved_searches",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    // The normalized querystring (without a leading "?").
    query: text().notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("saved_searches_user_name_uq").on(t.userId, t.name),
    index("saved_searches_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  user: one(users, {
    fields: [savedSearches.userId],
    references: [users.id],
  }),
}));

export type SavedSearchRow = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
