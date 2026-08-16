import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { fk, pk, timestamps } from './_shared';
import { users } from './users';
import { recipes } from './recipes';

/**
 * A first-class recipe review (Phase 2): a written critique paired with a star
 * rating, at most one per user per recipe, editable.
 *
 * Relationship to `ratings` (issues #174, #1010): `ratings` remains the single
 * source of truth for aggregate/feed math (see `~/lib/ratings` and
 * `topRatedScoreSql`), which never reads `reviews`. A `review.rating` is not a
 * second, independent star — it is the *same* star, mirrored. `upsertReview`
 * writes the review's rating through to `ratings`, and `setRating` writes back
 * into an existing review, so the unified "Ratings & reviews" card can show one
 * number that the summary above it agrees with. Recipe authors are the one
 * exception: they may write a review but their star is never mirrored, because
 * owner self-ratings are excluded from every aggregate.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer().notNull(),
    title: varchar({ length: 200 }),
    body: text(),
    // Optional "how it turned out" photo attached to the written review (#341).
    photoUrl: varchar({ length: 2048 }),
    // Set when the author edits their review after first publishing it. NULL on
    // the original write so the UI can show an "edited" marker.
    editedAt: timestamp({ withTimezone: true }),
    // Moderation hide (issue #357): a set timestamp removes this from member
    // (and always kid) views. `hiddenBy` records the actioning moderator.
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenBy: fk().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    // At most one review per user per recipe (issue #174), enforced at the DB.
    // the upsert helper targets this constraint to edit-in-place on re-review.
    unique('reviews_recipe_user_uq').on(t.recipeId, t.userId),
    index('reviews_recipe_idx').on(t.recipeId),
    // Covering index for the userId foreign key (mirrors ratings/comments,
    // issue #153) so "reviews by user" reads and the `ON DELETE cascade` when a
    // user is removed both stay index-fast instead of scanning the table.
    index('reviews_user_idx').on(t.userId),
    // Media-library usage lookup (issue #658). Partial: most reviews have no
    // photo.
    index('reviews_photo_url_idx')
      .on(t.photoUrl)
      .where(sql`${t.photoUrl} is not null`),
    // DB backstop for the 1–5 star range enforced in Zod (`reviewInput.rating`),
    // mirroring `ratings_value_range_check` for writes that bypass the action.
    check('reviews_rating_range_check', sql`${t.rating} between 1 and 5`),
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
