import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

/** Free-form, shared tags (e.g. "weeknight", "vegan", "grandma's"). */
export const tags = pgTable("tags", {
  id: pk(),
  slug: varchar({ length: 60 }).notNull().unique(),
  name: varchar({ length: 60 }).notNull(),
});

export const recipeTags = pgTable(
  "recipe_tags",
  {
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: fk()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
);

/** A 1–5 star rating; one per user per recipe. */
export const ratings = pgTable(
  "ratings",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer().notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("ratings_recipe_user_uq").on(t.recipeId, t.userId),
    index("ratings_recipe_idx").on(t.recipeId),
  ],
);

/**
 * The kind of a thread entry: a plain `comment`, or a `suggestion` — a proposed
 * change the recipe owner can mark resolved (Phase 2 suggestions/reviews).
 */
export const commentKind = pgEnum("comment_kind", ["comment", "suggestion"]);

/** Threaded comments / suggestions on a recipe. */
export const comments = pgTable(
  "comments",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: fk(),
    kind: commentKind().notNull().default("comment"),
    body: text().notNull(),
    // Set when a suggestion has been addressed/closed by the recipe owner.
    resolvedAt: timestamp({ withTimezone: true }),
    // Set when the owner folded a suggestion's change into the recipe itself.
    appliedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("comments_recipe_idx").on(t.recipeId),
    index("comments_parent_idx").on(t.parentId),
  ],
);

export const tagsRelations = relations(tags, ({ many }) => ({
  recipes: many(recipeTags),
}));

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeTags.recipeId],
    references: [recipes.id],
  }),
  tag: one(tags, {
    fields: [recipeTags.tagId],
    references: [tags.id],
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  recipe: one(recipes, {
    fields: [ratings.recipeId],
    references: [recipes.id],
  }),
  user: one(users, {
    fields: [ratings.userId],
    references: [users.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [comments.recipeId],
    references: [recipes.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "thread",
  }),
  replies: many(comments, { relationName: "thread" }),
}));

export type Tag = typeof tags.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentKind = (typeof commentKind.enumValues)[number];
