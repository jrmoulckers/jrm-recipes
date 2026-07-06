import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";
import { comments, ratings, recipeTags } from "./engagement";

export const recipeVisibility = pgEnum("recipe_visibility", [
  "private",
  "group",
  "unlisted",
  "public",
]);

export const recipeStatus = pgEnum("recipe_status", ["draft", "published"]);

export const recipeDifficulty = pgEnum("recipe_difficulty", [
  "easy",
  "medium",
  "hard",
]);

/**
 * Kinds of milestone recorded on a recipe's timeline. `adapted` marks both
 * sides of a fork (the new recipe's origin and the source's new descendant).
 * `suggestion_applied` marks a family suggestion the owner folded in place,
 * attributed to the contributor who proposed it.
 */
export const recipeEventType = pgEnum("recipe_event_type", [
  "created",
  "adapted",
  "updated",
  "published",
  "suggestion_applied",
]);

/** The core recipe record. */
export const recipes = pgTable(
  "recipes",
  {
    id: pk(),
    slug: varchar({ length: 96 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    description: text(),
    coverImageUrl: varchar({ length: 2048 }),

    authorId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: fk().references(() => groups.id, { onDelete: "set null" }),

    visibility: recipeVisibility().notNull().default("private"),
    status: recipeStatus().notNull().default("draft"),

    servings: integer().default(4),
    servingsNoun: varchar({ length: 40 }).default("servings"),
    prepMinutes: integer(),
    cookMinutes: integer(),
    totalMinutes: integer(),
    difficulty: recipeDifficulty(),
    cuisine: varchar({ length: 80 }),

    sourceName: varchar({ length: 200 }),
    sourceUrl: varchar({ length: 2048 }),
    notes: text(),

    // Adaptations / timelines. Nullable self-reference to the recipe this was
    // forked from; on parent deletion the fork survives as an original.
    forkedFromId: fk().references((): AnyPgColumn => recipes.id, {
      onDelete: "set null",
    }),
    forkNote: varchar({ length: 300 }),

    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("recipes_author_idx").on(t.authorId),
    index("recipes_group_idx").on(t.groupId),
    index("recipes_visibility_idx").on(t.visibility),
    index("recipes_slug_idx").on(t.slug),
    index("recipes_forked_from_idx").on(t.forkedFromId),
  ],
);

/** One ingredient line. `quantity`/`quantityMax` are numeric so we can scale. */
export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    section: varchar({ length: 120 }),
    quantity: real(),
    quantityMax: real(),
    unit: varchar({ length: 40 }),
    item: varchar({ length: 300 }).notNull(),
    note: varchar({ length: 300 }),
    optional: boolean().notNull().default(false),
  },
  (t) => [index("recipe_ingredients_recipe_idx").on(t.recipeId, t.position)],
);

/** One instruction step, optionally timed and with its own media. */
export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    section: varchar({ length: 120 }),
    instruction: text().notNull(),
    imageUrl: varchar({ length: 2048 }),
    videoUrl: varchar({ length: 2048 }),
    timerSeconds: integer(),
    // Techniques referenced in this step (Phase 3 "learn to cook" tutor).
    techniques: text().array(),
  },
  (t) => [index("recipe_steps_recipe_idx").on(t.recipeId, t.position)],
);

/**
 * Immutable snapshots capturing how a recipe evolved over time (Phase 2
 * timelines). Schema is present now so edits can be journaled from day one.
 */
export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    versionNumber: integer().notNull().default(1),
    label: varchar({ length: 200 }),
    summary: varchar({ length: 500 }),
    snapshot: text().notNull(),
    authorId: fk().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("recipe_versions_recipe_idx").on(t.recipeId, t.versionNumber)],
);

/**
 * Append-only log of milestones in a recipe's life (created, adapted, edited,
 * published). Powers the "family history" timeline. `relatedRecipeId` links the
 * two halves of a fork: on the new recipe it points back to the source; on the
 * source it points forward to the adaptation.
 */
export const recipeEvents = pgTable(
  "recipe_events",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    actorId: fk().references(() => users.id, { onDelete: "set null" }),
    type: recipeEventType().notNull(),
    note: text(),
    relatedRecipeId: fk().references((): AnyPgColumn => recipes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("recipe_events_recipe_idx").on(t.recipeId, t.createdAt)],
);

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  author: one(users, {
    fields: [recipes.authorId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [recipes.groupId],
    references: [groups.id],
  }),
  forkedFrom: one(recipes, {
    fields: [recipes.forkedFromId],
    references: [recipes.id],
    relationName: "adaptations",
  }),
  adaptations: many(recipes, { relationName: "adaptations" }),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  versions: many(recipeVersions),
  events: many(recipeEvents, { relationName: "recipeEvents" }),
  eventsAbout: many(recipeEvents, { relationName: "relatedRecipeEvents" }),
  tags: many(recipeTags),
  ratings: many(ratings),
  comments: many(comments),
}));

export const recipeIngredientsRelations = relations(
  recipeIngredients,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [recipeIngredients.recipeId],
      references: [recipes.id],
    }),
  }),
);

export const recipeStepsRelations = relations(recipeSteps, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeSteps.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
  }),
  author: one(users, {
    fields: [recipeVersions.authorId],
    references: [users.id],
  }),
}));

export const recipeEventsRelations = relations(recipeEvents, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeEvents.recipeId],
    references: [recipes.id],
    relationName: "recipeEvents",
  }),
  related: one(recipes, {
    fields: [recipeEvents.relatedRecipeId],
    references: [recipes.id],
    relationName: "relatedRecipeEvents",
  }),
  actor: one(users, {
    fields: [recipeEvents.actorId],
    references: [users.id],
  }),
}));

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type RecipeStep = typeof recipeSteps.$inferSelect;
export type NewRecipeStep = typeof recipeSteps.$inferInsert;
export type RecipeEvent = typeof recipeEvents.$inferSelect;
export type NewRecipeEvent = typeof recipeEvents.$inferInsert;
export type RecipeEventType = (typeof recipeEventType.enumValues)[number];
export type RecipeVisibility = (typeof recipeVisibility.enumValues)[number];
export type RecipeStatus = (typeof recipeStatus.enumValues)[number];
export type RecipeDifficulty = (typeof recipeDifficulty.enumValues)[number];
