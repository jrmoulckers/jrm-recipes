import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { fk, pk, timestamps } from './_shared';
import { foodItems } from './ingredients';
import { recipes } from './recipes';
import { users } from './users';

/**
 * A store a shopper buys from, owned by a user and reusable across lists.
 * Stores are entirely optional: a list may reference none, one, or many.
 */
export const shoppingStores = pgTable(
  'shopping_stores',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 120 }).notNull(),
    ...timestamps(),
  },
  (t) => [
    index('shopping_stores_user_idx').on(t.userId, t.name),
    uniqueIndex('shopping_stores_user_name_uq').on(t.userId, t.name),
  ],
);

/** A shopper's grocery list, owned by a user. */
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 120 }).notNull().default('Shopping list'),
    /**
     * Superseded by `shoppingListStores`. Retained and dual-written with the
     * first linked store for the expand/contract deploy window (see
     * `docs/migrations.md`); a follow-up contract migration drops it.
     */
    storeName: varchar({ length: 120 }),
    isDefault: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('shopping_lists_user_idx').on(t.userId),
    uniqueIndex('shopping_lists_user_default_uq')
      .on(t.userId)
      .where(sql`${t.isDefault} = true`),
    index('shopping_lists_user_active_idx')
      .on(t.userId, t.updatedAt)
      .where(sql`${t.archivedAt} is null`),
  ],
);

/**
 * Ordered link between a list and the stores it spans. Position drives display
 * order so the shopper controls which store reads first.
 */
export const shoppingListStores = pgTable(
  'shopping_list_stores',
  {
    listId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    storeId: fk()
      .notNull()
      .references(() => shoppingStores.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.storeId] }),
    index('shopping_list_stores_list_position_idx').on(t.listId, t.position),
    index('shopping_list_stores_store_idx').on(t.storeId),
    check('shopping_list_stores_position_check', sql`${t.position} >= 0`),
  ],
);

/**
 * One consolidated line on a shopping list. Quantities are numeric so the same
 * item added from multiple recipes can be re-aggregated. `recipeId` is a soft
 * link to the first contributing recipe (null for manually added items).
 */
export const shoppingListItems = pgTable(
  'shopping_list_items',
  {
    id: pk(),
    listId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    item: varchar({ length: 300 }).notNull(),
    quantity: doublePrecision(),
    quantityMax: doublePrecision(),
    unit: varchar({ length: 40 }),
    // Package-math quantities use float8 to preserve JavaScript Number boundary
    // behavior. Stable aggregation fields remain nullable for legacy rows.
    requiredBaseQuantity: doublePrecision(),
    requiredBaseQuantityMax: doublePrecision(),
    requiredBaseUnit: varchar({ length: 40 }),
    // `quantity`/`quantityMax` remain the exact recipe requirement. Purchase
    // fields are populated only when a valid package ceiling is applied.
    purchaseQuantity: doublePrecision(),
    purchaseUnit: varchar({ length: 40 }),
    packageCount: integer(),
    packageAmount: doublePrecision(),
    packageUnit: varchar({ length: 40 }),
    packageLabel: varchar({ length: 120 }),
    category: varchar({ length: 40 }),
    note: varchar({ length: 300 }),
    optional: boolean().notNull().default(false),
    checked: boolean().notNull().default(false),
    recipeId: fk().references(() => recipes.id, { onDelete: 'set null' }),
    foodId: fk().references(() => foodItems.id, { onDelete: 'set null' }),
    position: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index('shopping_list_items_list_idx').on(t.listId, t.position),
    // Covering index for the recipeId foreign key (issue #153 audit): the
    // `ON DELETE set null` when a linked recipe is deleted otherwise scans the
    // list-items table. `listId` is already covered by the composite above.
    index('shopping_list_items_recipe_idx').on(t.recipeId),
    index('shopping_list_items_food_idx').on(t.foodId),
    // Non-negative quantities with a sane range (upper bound >= lower bound),
    // matching recipe_ingredients so aggregated lines stay well-formed.
    check('shopping_list_items_quantity_check', sql`${t.quantity} >= 0`),
    check('shopping_list_items_quantity_max_check', sql`${t.quantityMax} >= 0`),
    check(
      'shopping_list_items_required_base_quantity_check',
      sql`${t.requiredBaseQuantity} is null or ${t.requiredBaseQuantity} >= 0`,
    ),
    check(
      'shopping_list_items_required_base_quantity_max_check',
      sql`${t.requiredBaseQuantityMax} is null or ${t.requiredBaseQuantityMax} >= 0`,
    ),
    check(
      'shopping_list_items_quantity_range_check',
      sql`${t.quantityMax} is null or ${t.quantity} is null or ${t.quantityMax} >= ${t.quantity}`,
    ),
    check(
      'shopping_list_items_required_base_quantity_range_check',
      sql`${t.requiredBaseQuantityMax} is null or ${t.requiredBaseQuantity} is null or ${t.requiredBaseQuantityMax} >= ${t.requiredBaseQuantity}`,
    ),
    check(
      'shopping_list_items_purchase_quantity_check',
      sql`${t.purchaseQuantity} is null or ${t.purchaseQuantity} >= 0`,
    ),
    check(
      'shopping_list_items_package_count_check',
      sql`${t.packageCount} is null or ${t.packageCount} >= 0`,
    ),
    check(
      'shopping_list_items_package_amount_check',
      sql`${t.packageAmount} is null or ${t.packageAmount} > 0`,
    ),
    check(
      'shopping_list_items_package_result_check',
      sql`(${t.packageCount} is null and ${t.purchaseQuantity} is null and ${t.purchaseUnit} is null and ${t.packageAmount} is null and ${t.packageUnit} is null) or (${t.packageCount} is not null and ${t.purchaseQuantity} is not null and ${t.purchaseUnit} is not null and ${t.packageAmount} is not null and ${t.packageUnit} is not null)`,
    ),
  ],
);

export const SHOPPING_RESTORE_OPERATIONS = [
  'remove_completed',
  'clear_all',
  'bulk_move_source',
  'bulk_move_destination',
  'rebuild',
  'restore',
] as const;

/**
 * A bounded, append-only restore point for one list. The service retains the
 * newest 20 per list and always scopes rows by both list and owner.
 */
export const shoppingListRestorePoints = pgTable(
  'shopping_list_restore_points',
  {
    id: pk(),
    listId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operation: varchar({ length: 40 })
      .$type<(typeof SHOPPING_RESTORE_OPERATIONS)[number]>()
      .notNull(),
    operationGroupId: varchar({ length: 24 }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('shopping_list_restore_points_list_created_idx').on(t.listId, t.createdAt, t.id),
    index('shopping_list_restore_points_user_idx').on(t.userId),
    index('shopping_list_restore_points_user_group_idx').on(t.userId, t.operationGroupId),
    check(
      'shopping_list_restore_points_operation_check',
      sql`${t.operation} in ('remove_completed', 'clear_all', 'bulk_move_source', 'bulk_move_destination', 'rebuild', 'restore')`,
    ),
  ],
);

/** Immutable item data captured at a restore point. */
export const shoppingListRestorePointItems = pgTable(
  'shopping_list_restore_point_items',
  {
    id: pk(),
    restorePointId: fk()
      .notNull()
      .references(() => shoppingListRestorePoints.id, { onDelete: 'cascade' }),
    item: varchar({ length: 300 }).notNull(),
    quantity: doublePrecision(),
    quantityMax: doublePrecision(),
    unit: varchar({ length: 40 }),
    requiredBaseQuantity: doublePrecision(),
    requiredBaseQuantityMax: doublePrecision(),
    requiredBaseUnit: varchar({ length: 40 }),
    purchaseQuantity: doublePrecision(),
    purchaseUnit: varchar({ length: 40 }),
    packageCount: integer(),
    packageAmount: doublePrecision(),
    packageUnit: varchar({ length: 40 }),
    packageLabel: varchar({ length: 120 }),
    category: varchar({ length: 40 }),
    note: varchar({ length: 300 }),
    optional: boolean().notNull().default(false),
    checked: boolean().notNull().default(false),
    recipeId: fk().references(() => recipes.id, { onDelete: 'set null' }),
    foodId: fk().references(() => foodItems.id, { onDelete: 'set null' }),
    position: integer().notNull(),
  },
  (t) => [
    index('shopping_list_restore_point_items_point_position_idx').on(
      t.restorePointId,
      t.position,
      t.id,
    ),
    index('shopping_list_restore_point_items_recipe_idx').on(t.recipeId),
    index('shopping_list_restore_point_items_food_idx').on(t.foodId),
    check('shopping_list_restore_point_items_position_check', sql`${t.position} >= 0`),
    check('shopping_list_restore_point_items_quantity_check', sql`${t.quantity} >= 0`),
    check('shopping_list_restore_point_items_quantity_max_check', sql`${t.quantityMax} >= 0`),
    check(
      'shopping_list_restore_point_items_quantity_range_check',
      sql`${t.quantityMax} is null or ${t.quantity} is null or ${t.quantityMax} >= ${t.quantity}`,
    ),
    check(
      'shopping_list_restore_point_items_required_base_quantity_check',
      sql`${t.requiredBaseQuantity} is null or ${t.requiredBaseQuantity} >= 0`,
    ),
    check(
      'shopping_list_restore_point_items_required_base_quantity_max_check',
      sql`${t.requiredBaseQuantityMax} is null or ${t.requiredBaseQuantityMax} >= 0`,
    ),
    check(
      'shopping_list_restore_point_items_required_base_quantity_range_check',
      sql`${t.requiredBaseQuantityMax} is null or ${t.requiredBaseQuantity} is null or ${t.requiredBaseQuantityMax} >= ${t.requiredBaseQuantity}`,
    ),
    check(
      'shopping_list_restore_point_items_purchase_quantity_check',
      sql`${t.purchaseQuantity} is null or ${t.purchaseQuantity} >= 0`,
    ),
    check(
      'shopping_list_restore_point_items_package_count_check',
      sql`${t.packageCount} is null or ${t.packageCount} >= 0`,
    ),
    check(
      'shopping_list_restore_point_items_package_amount_check',
      sql`${t.packageAmount} is null or ${t.packageAmount} > 0`,
    ),
    check(
      'shopping_list_restore_point_items_package_result_check',
      sql`(${t.packageCount} is null and ${t.purchaseQuantity} is null and ${t.purchaseUnit} is null and ${t.packageAmount} is null and ${t.packageUnit} is null) or (${t.packageCount} is not null and ${t.purchaseQuantity} is not null and ${t.purchaseUnit} is not null and ${t.packageAmount} is not null and ${t.packageUnit} is not null)`,
    ),
  ],
);

/**
 * A user's canonical destination for an ingredient. Resolved foods use
 * `foodId`; unresolved ingredient text falls back to Unicode-safe normalized
 * text until it can be linked to the food graph.
 */
export const shoppingIngredientRoutes = pgTable(
  'shopping_ingredient_routes',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: fk().references(() => foodItems.id, { onDelete: 'set null' }),
    normalizedItem: text().notNull(),
    displayItem: text().notNull(),
    preferredListId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    packageAmount: doublePrecision(),
    packageUnit: varchar({ length: 40 }),
    packageLabel: varchar({ length: 120 }),
    /** NULL inherits the global preference; true/false explicitly overrides. */
    packageRounding: boolean(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('shopping_ingredient_routes_user_food_uq')
      .on(t.userId, t.foodId)
      .where(sql`${t.foodId} is not null`),
    uniqueIndex('shopping_ingredient_routes_user_normalized_item_uq').on(
      t.userId,
      t.normalizedItem,
    ),
    index('shopping_ingredient_routes_user_idx').on(t.userId),
    index('shopping_ingredient_routes_food_idx').on(t.foodId),
    index('shopping_ingredient_routes_preferred_list_idx').on(t.preferredListId),
    check(
      'shopping_ingredient_routes_package_amount_check',
      sql`${t.packageAmount} is null or ${t.packageAmount} > 0`,
    ),
    check(
      'shopping_ingredient_routes_package_pair_check',
      sql`(${t.packageAmount} is null and ${t.packageUnit} is null) or (${t.packageAmount} is not null and ${t.packageUnit} is not null)`,
    ),
  ],
);

/** Ordered alternative destinations shown without duplicating routed items. */
export const shoppingIngredientRouteAlternatives = pgTable(
  'shopping_ingredient_route_alternatives',
  {
    routeId: fk()
      .notNull()
      .references(() => shoppingIngredientRoutes.id, { onDelete: 'cascade' }),
    listId: fk()
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.routeId, t.listId] }),
    index('shopping_ingredient_route_alternatives_route_position_idx').on(t.routeId, t.position),
    index('shopping_ingredient_route_alternatives_list_idx').on(t.listId),
    check('shopping_ingredient_route_alternatives_position_check', sql`${t.position} >= 0`),
  ],
);

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingLists.userId],
    references: [users.id],
  }),
  items: many(shoppingListItems),
  stores: many(shoppingListStores),
  restorePoints: many(shoppingListRestorePoints),
  preferredRoutes: many(shoppingIngredientRoutes),
  routeAlternatives: many(shoppingIngredientRouteAlternatives),
}));

export const shoppingStoresRelations = relations(shoppingStores, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingStores.userId],
    references: [users.id],
  }),
  lists: many(shoppingListStores),
}));

export const shoppingListStoresRelations = relations(shoppingListStores, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingListStores.listId],
    references: [shoppingLists.id],
  }),
  store: one(shoppingStores, {
    fields: [shoppingListStores.storeId],
    references: [shoppingStores.id],
  }),
}));

export const shoppingListRestorePointsRelations = relations(
  shoppingListRestorePoints,
  ({ one, many }) => ({
    list: one(shoppingLists, {
      fields: [shoppingListRestorePoints.listId],
      references: [shoppingLists.id],
    }),
    user: one(users, {
      fields: [shoppingListRestorePoints.userId],
      references: [users.id],
    }),
    items: many(shoppingListRestorePointItems),
  }),
);

export const shoppingListRestorePointItemsRelations = relations(
  shoppingListRestorePointItems,
  ({ one }) => ({
    restorePoint: one(shoppingListRestorePoints, {
      fields: [shoppingListRestorePointItems.restorePointId],
      references: [shoppingListRestorePoints.id],
    }),
    recipe: one(recipes, {
      fields: [shoppingListRestorePointItems.recipeId],
      references: [recipes.id],
    }),
    food: one(foodItems, {
      fields: [shoppingListRestorePointItems.foodId],
      references: [foodItems.id],
    }),
  }),
);

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
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
}));

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
export type ShoppingStore = typeof shoppingStores.$inferSelect;
export type NewShoppingStore = typeof shoppingStores.$inferInsert;
export type ShoppingListStore = typeof shoppingListStores.$inferSelect;
export type NewShoppingListStore = typeof shoppingListStores.$inferInsert;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type NewShoppingListItem = typeof shoppingListItems.$inferInsert;
export type ShoppingListRestorePoint = typeof shoppingListRestorePoints.$inferSelect;
export type NewShoppingListRestorePoint = typeof shoppingListRestorePoints.$inferInsert;
export type ShoppingListRestorePointItem = typeof shoppingListRestorePointItems.$inferSelect;
export type NewShoppingListRestorePointItem = typeof shoppingListRestorePointItems.$inferInsert;
export type ShoppingIngredientRoute = typeof shoppingIngredientRoutes.$inferSelect;
export type NewShoppingIngredientRoute = typeof shoppingIngredientRoutes.$inferInsert;
export type ShoppingIngredientRouteAlternative =
  typeof shoppingIngredientRouteAlternatives.$inferSelect;
export type NewShoppingIngredientRouteAlternative =
  typeof shoppingIngredientRouteAlternatives.$inferInsert;
