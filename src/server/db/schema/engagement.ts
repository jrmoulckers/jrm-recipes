import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
  type AnyPgColumn,
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
    // Covering index for the userId foreign key (issue #153). The composite
    // unique above is recipeId-first, so it can't serve a userId-first lookup or
    // the `ON DELETE cascade` when a user is removed; this keeps both index-fast.
    index("ratings_user_idx").on(t.userId),
    // DB backstop for the 1–5 star range enforced in Zod (`ratingInput.value`
    // in src/server/engagement/validation.ts). Guards writes that bypass the
    // action path (seed, imports, admin/raw SQL) from persisting 0/6/negative.
    check("ratings_value_range_check", sql`${t.value} between 1 and 5`),
  ],
);

/**
 * The kind of a thread entry: a plain `comment`, or a `suggestion` — a proposed
 * change the recipe owner can mark resolved (Phase 2 suggestions/reviews).
 */
export const commentKind = pgEnum("comment_kind", ["comment", "suggestion"]);

/**
 * What a suggestion is anchored to (issue #346). NULL for a whole-recipe comment
 * or suggestion; set to `ingredient`/`step` when a member suggests an edit tied
 * to a specific ingredient row or method step.
 */
export const commentAnchorType = pgEnum("comment_anchor_type", [
  "ingredient",
  "step",
]);

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
    // Self-referential thread link. `cascade` so deleting a parent comment also
    // removes its replies (thread hygiene) — prevents orphaned threads rooted at
    // a missing parent. Uses the `AnyPgColumn` self-reference pattern from
    // recipes.forkedFromId / recipeEvents.relatedRecipeId.
    parentId: fk().references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    kind: commentKind().notNull().default("comment"),
    body: text().notNull(),
    // Anchored suggestions (issue #346): the ingredient/step the suggestion
    // refers to, plus a snapshot label so it still reads sensibly if the target
    // is later edited or removed. No FK — the id is a soft pointer.
    anchorType: commentAnchorType(),
    anchorId: fk(),
    anchorLabel: varchar({ length: 200 }),
    // Set when a suggestion has been addressed/closed by the recipe owner.
    resolvedAt: timestamp({ withTimezone: true }),
    // Set when the owner folded a suggestion's change into the recipe itself.
    appliedAt: timestamp({ withTimezone: true }),
    // Moderation hide (issue #357): a set timestamp removes this from member
    // (and always kid) views. `hiddenBy` records the actioning moderator.
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenBy: fk().references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("comments_recipe_idx").on(t.recipeId),
    index("comments_parent_idx").on(t.parentId),
    // Covering index for the userId foreign key (issue #153): backs "comments by
    // user" reads and the `ON DELETE cascade` when a user is removed, both of
    // which otherwise sequentially scan the table.
    index("comments_user_idx").on(t.userId),
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
export type CommentAnchorType = (typeof commentAnchorType.enumValues)[number];
