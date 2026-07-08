import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { fk, pk, softDelete, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";
import { comments, ratings, recipeTags } from "./engagement";
import { reviews } from "./reviews";
import type { RecipeInput } from "~/server/recipes/validation";

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

    // Structured, author-declared dietary flags (issue #404), stored as the
    // canonical `DietaryTag` strings (vegan, vegetarian, dairy-free,
    // gluten-free, egg-free). Separate from free-text `tags` so "safe for"
    // filtering and badges have a trustworthy source; NULL/empty means the
    // author made no declaration (not "unsafe").
    dietaryFlags: text().array(),

    sourceName: varchar({ length: 200 }),
    sourceUrl: varchar({ length: 2048 }),
    notes: text(),

    // Optional per-serving nutrition (issue #414). All nullable — a recipe may
    // carry none, some, or all of these. Energy in kcal and sodium in mg are
    // whole numbers (integer); macronutrients are grams and may be fractional
    // (real). Non-negativity is enforced by CHECK constraints below, mirroring
    // the Zod `nutritionInput` bounds in src/server/recipes/validation.ts.
    calories: integer(),
    proteinGrams: real(),
    carbsGrams: real(),
    fatGrams: real(),
    saturatedFatGrams: real(),
    sodiumMg: integer(),
    sugarGrams: real(),
    fiberGrams: real(),

    // Adaptations / timelines. Nullable self-reference to the recipe this was
    // forked from; on parent deletion the fork survives as an original.
    forkedFromId: fk().references((): AnyPgColumn => recipes.id, {
      onDelete: "set null",
    }),
    forkNote: varchar({ length: 300 }),

    publishedAt: timestamp({ withTimezone: true }),
    // Denormalized, owner-excluded rating aggregates (issue #154). Maintained
    // transactionally by the rating mutations (setRating/removeRating) and read
    // directly by list/feed cards + the top-rated ordering, so a feed never has
    // to pull every `ratings` row just to show a count + average. `ratingAvg` is
    // derived (`ratingSum / ratingCount`) rather than stored to avoid rounding
    // drift. Owners can't rate their own recipe, so these never count self-votes.
    ratingCount: integer().notNull().default(0),
    ratingSum: integer().notNull().default(0),
    // Soft-delete (issue #165): deleting a recipe tombstones it instead of
    // cascading away its versions/events/ratings/comments, so family history
    // survives and an owner can restore it. Children stay, hidden via the parent.
    ...softDelete(() => users.id),
    ...timestamps(),
  },
  (t) => [
    // Every recipe read path filters `deleted_at IS NULL` (issue #165), so the
    // hot lookup indexes are partial: they stay small and never scan tombstones.
    index("recipes_author_idx")
      .on(t.authorId)
      .where(sql`${t.deletedAt} is null`),
    index("recipes_group_idx")
      .on(t.groupId)
      .where(sql`${t.deletedAt} is null`),
    index("recipes_visibility_idx")
      .on(t.visibility)
      .where(sql`${t.deletedAt} is null`),
    // Slugs are public lookup keys (getRecipe resolves by slug), so they must be
    // globally unique — matching groups.slug / tags.slug. The unique constraint
    // also provides the btree index that backs slug lookups, so no separate
    // non-unique index is needed.
    unique("recipes_slug_uq").on(t.slug),
    index("recipes_forked_from_idx").on(t.forkedFromId),
    // Non-negative time/serving invariants mirroring Zod (`recipeInput` in
    // src/server/recipes/validation.ts: servings min 1, minutes min 0). These
    // columns are nullable, so a NULL value passes the check by SQL semantics.
    check("recipes_servings_check", sql`${t.servings} >= 1`),
    check("recipes_prep_minutes_check", sql`${t.prepMinutes} >= 0`),
    check("recipes_cook_minutes_check", sql`${t.cookMinutes} >= 0`),
    check("recipes_total_minutes_check", sql`${t.totalMinutes} >= 0`),
    // Denormalized rating aggregates can never be negative (issue #154); the
    // migration backfills them and the mutations only ever += / -= real votes.
    check("recipes_rating_count_check", sql`${t.ratingCount} >= 0`),
    check("recipes_rating_sum_check", sql`${t.ratingSum} >= 0`),
    // Per-serving nutrition is non-negative (issue #414). NULLs pass by SQL
    // semantics, matching the "optional" Zod bounds.
    check("recipes_calories_check", sql`${t.calories} >= 0`),
    check("recipes_protein_grams_check", sql`${t.proteinGrams} >= 0`),
    check("recipes_carbs_grams_check", sql`${t.carbsGrams} >= 0`),
    check("recipes_fat_grams_check", sql`${t.fatGrams} >= 0`),
    check("recipes_saturated_fat_grams_check", sql`${t.saturatedFatGrams} >= 0`),
    check("recipes_sodium_mg_check", sql`${t.sodiumMg} >= 0`),
    check("recipes_sugar_grams_check", sql`${t.sugarGrams} >= 0`),
    check("recipes_fiber_grams_check", sql`${t.fiberGrams} >= 0`),
  ],
);

/**
 * Full-text search (issue #158) is intentionally NOT modelled as Drizzle columns
 * or indexes here. The FTS migration hand-adds:
 *   - a generated, STORED `tsvector` column `recipes.search_vector`
 *     (`setweight` A/B/C over title/description/cuisine, `english` config) with a
 *     GIN index, queried via `search_vector @@ websearch_to_tsquery(...)` in
 *     `searchRecipes` (see `recipeSearchMatchSql`); and
 *   - `pg_trgm` GIN indexes on `recipe_ingredients.item` and `tags.name` so the
 *     substring `ILIKE '%q%'` fallbacks are index-backed instead of seq scans.
 * Keeping these untracked (like the `pg_trgm` extension itself) avoids
 * drizzle-kit generated-column/opclass drift while still enforcing them in the
 * database. Nothing in the app SELECTs `search_vector`, so the ORM never needs
 * to know it exists.
 */

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
  (t) => [
    index("recipe_ingredients_recipe_idx").on(t.recipeId, t.position),
    // Non-negative quantities; a range's upper bound can't fall below its lower
    // bound. Mirrors `ingredientInput` (min 0) in src/server/recipes/validation.ts.
    check("recipe_ingredients_quantity_check", sql`${t.quantity} >= 0`),
    check("recipe_ingredients_quantity_max_check", sql`${t.quantityMax} >= 0`),
    check(
      "recipe_ingredients_quantity_range_check",
      sql`${t.quantityMax} is null or ${t.quantity} is null or ${t.quantityMax} >= ${t.quantity}`,
    ),
  ],
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
  (t) => [
    index("recipe_steps_recipe_idx").on(t.recipeId, t.position),
    // A step timer can't run negative. Mirrors `stepInput.timerSeconds` (min 0).
    check("recipe_steps_timer_seconds_check", sql`${t.timerSeconds} >= 0`),
  ],
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
    // The full RecipeInput at save time, stored as `jsonb` so Postgres validates
    // the JSON structurally and future timeline/diff features can query inside a
    // snapshot. `parseSnapshot` still Zod-validates the *shape* on read.
    snapshot: jsonb().$type<RecipeInput>().notNull(),
    authorId: fk().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // (recipe_id, version_number) is unique at the DB level (issue #151). Version
    // numbers are allocated as max+1, but READ COMMITTED lets two concurrent edits
    // read the same max and write the same number. The constraint makes the DB the
    // arbiter; its btree also backs the version-ordered history reads that the old
    // non-unique `recipe_versions_recipe_idx` used to serve.
    unique("recipe_versions_recipe_version_uq").on(t.recipeId, t.versionNumber),
    // Covering index for the authorId foreign key (issue #153): the
    // `ON DELETE set null` on user delete otherwise scans every version row.
    index("recipe_versions_author_idx").on(t.authorId),
  ],
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
  (t) => [
    index("recipe_events_recipe_idx").on(t.recipeId, t.createdAt),
    // Covering indexes for the actorId + relatedRecipeId foreign keys (issue
    // #153): the actor `ON DELETE set null` cascade and the fork back-link
    // lookup (events pointing at a related recipe) otherwise scan the log.
    index("recipe_events_actor_idx").on(t.actorId),
    index("recipe_events_related_idx").on(t.relatedRecipeId),
  ],
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
  reviews: many(reviews),
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
