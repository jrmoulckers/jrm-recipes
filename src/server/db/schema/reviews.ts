import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

/**
 * A first-class recipe review (Phase 2): a written critique paired with a star
 * rating, at most one per user per recipe, editable.
 *
 * Relationship to `ratings` (issue #174): `ratings` stays the lightweight,
 * one-tap star that drives the discover-feed aggregates (see `~/lib/ratings`
 * and `topRatedScoreSql`). A `review.rating` is the star the author attaches to
 * their written review and is authoritative *for that review*. The two are kept
 * intentionally independent for now: aggregate/feed math reads `ratings`, never
 * `reviews`, so adding a review does not change a recipe's rating summary. A
 * later phase may reconcile them (e.g. mirror a review's rating into `ratings`),
 * but that reconciliation is deliberately out of scope here.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    title: varchar({ length: 200 }),
    body: text(),
    // Set when the author edits their review after first publishing it; NULL on
    // the original write so the UI can show an "edited" marker.
    editedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // At most one review per user per recipe (issue #174), enforced at the DB —
    // the upsert helper targets this constraint to edit-in-place on re-review.
    unique("reviews_recipe_user_uq").on(t.recipeId, t.userId),
    index("reviews_recipe_idx").on(t.recipeId),
    // Covering index for the userId foreign key (mirrors ratings/comments,
    // issue #153) so "reviews by user" reads and the `ON DELETE cascade` when a
    // user is removed both stay index-fast instead of scanning the table.
    index("reviews_user_idx").on(t.userId),
    // DB backstop for the 1–5 star range enforced in Zod (`reviewInput.rating`),
    // mirroring `ratings_value_range_check` for writes that bypass the action.
    check("reviews_rating_range_check", sql`${t.rating} between 1 and 5`),
  ],
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  recipe: one(recipes, {
    fields: [reviews.recipeId],
    references: [recipes.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
