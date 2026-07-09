import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";
import { groups } from "./groups";

/**
 * One-tap favorites: a bookmark of any recipe a user can view. Distinct from
 * authored/group recipes, so a cook can keep the dishes they love in one place.
 */
export const favorites = pgTable(
  "favorites",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    unique("favorites_user_recipe_uq").on(t.userId, t.recipeId),
    index("favorites_user_idx").on(t.userId),
    index("favorites_recipe_idx").on(t.recipeId),
  ],
);

/**
 * How widely a collection can be seen. `unlisted` collections are reachable only
 * via their unguessable `shareToken`; `public` ones are visible to anyone.
 * (Collections aren't group-scoped, so there's no `group` value here.)
 */
export const collectionVisibility = pgEnum("collection_visibility", [
  "private",
  "unlisted",
  "public",
]);

/** A user-named collection (a personal cookbook) of saved recipes. */
export const collections = pgTable(
  "collections",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    description: varchar({ length: 500 }),
    coverImageUrl: varchar({ length: 2048 }),
    visibility: collectionVisibility().notNull().default("private"),
    // Unguessable share key, minted the first time the collection is shared.
    shareToken: varchar({ length: 24 }).unique(),
    ...timestamps(),
  },
  (t) => [index("collections_user_idx").on(t.userId)],
);

/** Membership of a recipe in a collection, ordered by `position`. */
export const collectionRecipes = pgTable(
  "collection_recipes",
  {
    id: pk(),
    collectionId: fk()
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    addedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("collection_recipes_collection_recipe_uq").on(
      t.collectionId,
      t.recipeId,
    ),
    index("collection_recipes_collection_idx").on(t.collectionId, t.position),
    index("collection_recipes_recipe_idx").on(t.recipeId),
  ],
);

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [favorites.recipeId],
    references: [recipes.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  owner: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  recipes: many(collectionRecipes),
  sharedWithGroups: many(collectionGroups),
}));

/**
 * View-sharing link between a collection and a family group (issue #365).
 * A collection *owner* can share their cookbook with a group they belong to;
 * every member of that group can then view it (read-only in this slice — only
 * the owner adds/removes recipes). Unsharing deletes the row and immediately
 * revokes access. One row per collection+group pair.
 */
export const collectionGroups = pgTable(
  "collection_groups",
  {
    id: pk(),
    collectionId: fk()
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    groupId: fk()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // Who shared it (for provenance); nulls out if that user is removed.
    sharedById: fk().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("collection_groups_collection_group_uq").on(
      t.collectionId,
      t.groupId,
    ),
    index("collection_groups_collection_idx").on(t.collectionId),
    index("collection_groups_group_idx").on(t.groupId),
  ],
);

export const collectionGroupsRelations = relations(
  collectionGroups,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionGroups.collectionId],
      references: [collections.id],
    }),
    group: one(groups, {
      fields: [collectionGroups.groupId],
      references: [groups.id],
    }),
    sharedBy: one(users, {
      fields: [collectionGroups.sharedById],
      references: [users.id],
    }),
  }),
);

export const collectionRecipesRelations = relations(
  collectionRecipes,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionRecipes.collectionId],
      references: [collections.id],
    }),
    recipe: one(recipes, {
      fields: [collectionRecipes.recipeId],
      references: [recipes.id],
    }),
  }),
);

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type CollectionVisibility =
  (typeof collectionVisibility.enumValues)[number];
export type CollectionRecipe = typeof collectionRecipes.$inferSelect;
export type NewCollectionRecipe = typeof collectionRecipes.$inferInsert;
export type CollectionGroup = typeof collectionGroups.$inferSelect;
export type NewCollectionGroup = typeof collectionGroups.$inferInsert;
