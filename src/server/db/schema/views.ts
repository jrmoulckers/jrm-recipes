import { relations } from "drizzle-orm";
import { index, pgTable, timestamp, unique } from "drizzle-orm/pg-core";

import { fk, pk } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

/**
 * One row per (user, recipe) capturing the last time that user opened the
 * recipe. Viewing again upserts `viewedAt`, so the table stays one row per
 * distinct recipe and powers a "Recently viewed" rail. Seeding is out of scope
 * (owned by #185).
 */
export const recipeViews = pgTable(
  "recipe_views",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    viewedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One view row per user+recipe; re-viewing bumps `viewedAt` via upsert.
    unique("recipe_views_user_recipe_uq").on(t.userId, t.recipeId),
    // Fast "my recently viewed" feed (newest first per user).
    index("recipe_views_user_viewed_idx").on(t.userId, t.viewedAt),
    index("recipe_views_recipe_idx").on(t.recipeId),
  ],
);

export const recipeViewsRelations = relations(recipeViews, ({ one }) => ({
  user: one(users, {
    fields: [recipeViews.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [recipeViews.recipeId],
    references: [recipes.id],
  }),
}));

export type RecipeView = typeof recipeViews.$inferSelect;
export type NewRecipeView = typeof recipeViews.$inferInsert;
