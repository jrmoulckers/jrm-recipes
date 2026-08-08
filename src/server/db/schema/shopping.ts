import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { foodItems } from "./ingredients";
import { recipes } from "./recipes";
import { users } from "./users";

/** A shopper's grocery list, owned by a user. */
export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull().default("Shopping list"),
    storeName: varchar({ length: 120 }),
    isDefault: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("shopping_lists_user_idx").on(t.userId),
    uniqueIndex("shopping_lists_user_default_uq")
      .on(t.userId)
      .where(sql`${t.isDefault} = true`),
    index("shopping_lists_user_active_idx")
      .on(t.userId, t.updatedAt)
      .where(sql`${t.archivedAt} is null`),
  ],
);

/**
 * One consolidated line on a shopping list. Quantities are numeric so the same
 * item added from multiple recipes can be re-aggregated. `recipeId` is a soft
 * link to the first contributing recipe (null for manually added items).
 */
export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: pk(),
    listId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    item: varchar({ length: 300 }).notNull(),
    quantity: real(),
    quantityMax: real(),
    unit: varchar({ length: 40 }),
    category: varchar({ length: 40 }),
    note: varchar({ length: 300 }),
    optional: boolean().notNull().default(false),
    checked: boolean().notNull().default(false),
    recipeId: fk().references(() => recipes.id, { onDelete: "set null" }),
    foodId: fk().references(() => foodItems.id, { onDelete: "set null" }),
    position: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("shopping_list_items_list_idx").on(t.listId, t.position),
    // Covering index for the recipeId foreign key (issue #153 audit): the
    // `ON DELETE set null` when a linked recipe is deleted otherwise scans the
    // list-items table. `listId` is already covered by the composite above.
    index("shopping_list_items_recipe_idx").on(t.recipeId),
    index("shopping_list_items_food_idx").on(t.foodId),
    // Non-negative quantities with a sane range (upper bound >= lower bound),
    // matching recipe_ingredients so aggregated lines stay well-formed.
    check("shopping_list_items_quantity_check", sql`${t.quantity} >= 0`),
    check("shopping_list_items_quantity_max_check", sql`${t.quantityMax} >= 0`),
    check(
      "shopping_list_items_quantity_range_check",
      sql`${t.quantityMax} is null or ${t.quantity} is null or ${t.quantityMax} >= ${t.quantity}`,
    ),
  ],
);

/**
 * A user's canonical destination for an ingredient. Resolved foods use
 * `foodId`; unresolved ingredient text falls back to Unicode-safe normalized
 * text until it can be linked to the food graph.
 */
export const shoppingIngredientRoutes = pgTable(
  "shopping_ingredient_routes",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    foodId: fk().references(() => foodItems.id, { onDelete: "set null" }),
    normalizedItem: text().notNull(),
    displayItem: text().notNull(),
    preferredListId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("shopping_ingredient_routes_user_food_uq")
      .on(t.userId, t.foodId)
      .where(sql`${t.foodId} is not null`),
    uniqueIndex("shopping_ingredient_routes_user_normalized_item_uq").on(
      t.userId,
      t.normalizedItem,
    ),
    index("shopping_ingredient_routes_user_idx").on(t.userId),
    index("shopping_ingredient_routes_food_idx").on(t.foodId),
    index("shopping_ingredient_routes_preferred_list_idx").on(
      t.preferredListId,
    ),
  ],
);

/** Ordered alternative destinations shown without duplicating routed items. */
export const shoppingIngredientRouteAlternatives = pgTable(
  "shopping_ingredient_route_alternatives",
  {
    routeId: fk()
      .notNull()
      .references(() => shoppingIngredientRoutes.id, { onDelete: "cascade" }),
    listId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.routeId, t.listId] }),
    index("shopping_ingredient_route_alternatives_route_position_idx").on(
      t.routeId,
      t.position,
    ),
    index("shopping_ingredient_route_alternatives_list_idx").on(t.listId),
    check(
      "shopping_ingredient_route_alternatives_position_check",
      sql`${t.position} >= 0`,
    ),
  ],
);

export const shoppingListsRelations = relations(
  shoppingLists,
  ({ one, many }) => ({
    user: one(users, {
      fields: [shoppingLists.userId],
      references: [users.id],
    }),
    items: many(shoppingListItems),
    preferredRoutes: many(shoppingIngredientRoutes),
    routeAlternatives: many(shoppingIngredientRouteAlternatives),
  }),
);

export const shoppingListItemsRelations = relations(
  shoppingListItems,
  ({ one }) => ({
    list: one(shoppingLists, {
      fields: [shoppingListItems.listId],
      references: [shoppingLists.id],
    }),
    recipe: one(recipes, {
      fields: [shoppingListItems.recipeId],
      references: [recipes.id],
    }),
    food: one(foodItems, {
      fields: [shoppingListItems.foodId],
      references: [foodItems.id],
    }),
  }),
);

export const shoppingIngredientRoutesRelations = relations(
  shoppingIngredientRoutes,
  ({ one, many }) => ({
    user: one(users, {
      fields: [shoppingIngredientRoutes.userId],
      references: [users.id],
    }),
    food: one(foodItems, {
      fields: [shoppingIngredientRoutes.foodId],
      references: [foodItems.id],
    }),
    preferredList: one(shoppingLists, {
      fields: [shoppingIngredientRoutes.preferredListId],
      references: [shoppingLists.id],
    }),
    alternatives: many(shoppingIngredientRouteAlternatives),
  }),
);

export const shoppingIngredientRouteAlternativesRelations = relations(
  shoppingIngredientRouteAlternatives,
  ({ one }) => ({
    route: one(shoppingIngredientRoutes, {
      fields: [shoppingIngredientRouteAlternatives.routeId],
      references: [shoppingIngredientRoutes.id],
    }),
    list: one(shoppingLists, {
      fields: [shoppingIngredientRouteAlternatives.listId],
      references: [shoppingLists.id],
    }),
  }),
);

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type NewShoppingList = typeof shoppingLists.$inferInsert;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type NewShoppingListItem = typeof shoppingListItems.$inferInsert;
export type ShoppingIngredientRoute =
  typeof shoppingIngredientRoutes.$inferSelect;
export type NewShoppingIngredientRoute =
  typeof shoppingIngredientRoutes.$inferInsert;
export type ShoppingIngredientRouteAlternative =
  typeof shoppingIngredientRouteAlternatives.$inferSelect;
export type NewShoppingIngredientRouteAlternative =
  typeof shoppingIngredientRouteAlternatives.$inferInsert;
