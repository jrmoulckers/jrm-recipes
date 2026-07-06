import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

/** A shopper's grocery list, owned by a user. */
export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull().default("Shopping list"),
    ...timestamps(),
  },
  (t) => [index("shopping_lists_user_idx").on(t.userId)],
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
    checked: boolean().notNull().default(false),
    recipeId: fk().references(() => recipes.id, { onDelete: "set null" }),
    position: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("shopping_list_items_list_idx").on(t.listId, t.position)],
);

export const shoppingListsRelations = relations(
  shoppingLists,
  ({ one, many }) => ({
    user: one(users, {
      fields: [shoppingLists.userId],
      references: [users.id],
    }),
    items: many(shoppingListItems),
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
  }),
);

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type NewShoppingList = typeof shoppingLists.$inferInsert;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type NewShoppingListItem = typeof shoppingListItems.$inferInsert;
