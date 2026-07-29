import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  unique,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";
import { recipes } from "./recipes";

/**
 * The food knowledge graph (issue: interchangeable units → live food graph, see
 * `docs/food-graph.md`). `food_items` is the canonical **node** table: one row
 * per food *identity* (Onion, Tomato), plus variety child rows (yellow/red
 * onion) that point at their canonical parent via `parentId`. It starts life as
 * a mirror of the curated static dataset in `src/lib/food-db.ts` (seeded by
 * `src/server/db/seed-ingredients.ts`, `source = 'curated'`) and is enriched
 * over time by mining the recipe corpus (`source = 'mined'`).
 *
 * Hanging off each node are the learned-affinity tables:
 * - {@link foodAliases}    — every phrasing that resolves to a node.
 * - {@link foodUnitStats}  — which units + typical quantities people use.
 * - {@link foodPrepStats}  — which prep methods (diced, minced, …) people use.
 * - {@link foodPairs}      — co-occurrence edges (the near-neighbour graph).
 *
 * The recipe editor's unit picker still reads the static `food-db.ts` module for
 * instant, offline, client-safe defaults; these tables let *server-side*
 * features (smart ingredient entry, near-neighbour suggestions, shopping-list
 * categorization, analytics) enrich those defaults with live crowd data.
 */
export const foodItems = pgTable(
  "food_items",
  {
    id: pk(),
    /** Stable, unique key derived from the food name; also the seed id source. */
    slug: varchar({ length: 80 }).notNull().unique(),
    name: varchar({ length: 120 }).notNull(),
    /** Canonical {@link FoodCategory} string from `food-db.ts`. */
    category: varchar({ length: 40 }).notNull(),
    /** Approximate weigh-by density (g/mL), or NULL when measured by count. */
    densityGPerMl: real(),
    /**
     * Variety → canonical parent (yellow onion → onion). NULL for a canonical
     * node. Self-referential FK using the `AnyPgColumn` pattern; deleting a
     * parent cascades to its varieties.
     */
    parentId: fk().references((): AnyPgColumn => foodItems.id, {
      onDelete: "cascade",
    }),
    /** Provenance: `curated` (static seed) or `mined` (crowd corpus). */
    source: varchar({ length: 16 }).notNull().default("curated"),
    /** Denormalized popularity: distinct recipes that reference this node. */
    recipeCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("food_items_category_idx").on(t.category),
    index("food_items_parent_idx").on(t.parentId),
    check("food_items_recipe_count_check", sql`${t.recipeCount} >= 0`),
  ],
);

/**
 * Every free-text phrasing that resolves to a food node. Curated aliases seed it
 * from `food-db.ts`; mined aliases accrue from the corpus. `useCount` powers
 * "did you mean" ranking and the promotion of a frequent alias to a real
 * variety node. Unique per (`foodId`, `alias`); `alias` is normalized (see
 * `normalizeFoodText`) and indexed for resolution lookups.
 */
export const foodAliases = pgTable(
  "food_aliases",
  {
    id: pk(),
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: "cascade" }),
    alias: varchar({ length: 160 }).notNull(),
    source: varchar({ length: 16 }).notNull().default("mined"),
    useCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique("food_aliases_food_alias_uq").on(t.foodId, t.alias),
    index("food_aliases_alias_idx").on(t.alias),
    check("food_aliases_use_count_check", sql`${t.useCount} >= 0`),
  ],
);

/**
 * Unit + quantity affinity per food, mined from `recipe_ingredients`. `unit` is
 * a canonical `units.ts` token where one exists. `p10`/`p50`/`p90` capture the
 * common-amount distribution (median + a sensible range) so the editor can
 * pre-fill a typical quantity. Composite PK (`foodId`, `unit`).
 */
export const foodUnitStats = pgTable(
  "food_unit_stats",
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: "cascade" }),
    unit: varchar({ length: 40 }).notNull(),
    useCount: integer().notNull().default(0),
    /** Quantity distribution for this (food, unit): 10th/50th/90th percentile. */
    p10: real(),
    p50: real(),
    p90: real(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.unit] }),
    index("food_unit_stats_food_idx").on(t.foodId),
    check("food_unit_stats_use_count_check", sql`${t.useCount} >= 0`),
  ],
);

/**
 * Prep-method affinity per food (diced, minced, softened, …), mined from the
 * `recipe_ingredients.prep` column. Composite PK (`foodId`, `prep`).
 */
export const foodPrepStats = pgTable(
  "food_prep_stats",
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: "cascade" }),
    prep: varchar({ length: 200 }).notNull(),
    useCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.prep] }),
    index("food_prep_stats_food_idx").on(t.foodId),
    check("food_prep_stats_use_count_check", sql`${t.useCount} >= 0`),
  ],
);

/**
 * Co-occurrence edges — the near-neighbour graph. Each undirected pair is stored
 * once with `foodAId < foodBId` (enforced by a check) so there are no duplicate
 * mirror rows. `coCount` is the number of recipes containing both foods; `lift`
 * = P(A,B) / (P(A)·P(B)) is precomputed so distinctive pairings (onion→tomato)
 * outrank ubiquitous ones (onion→salt). Indexed on each side for neighbour
 * lookups. Composite PK (`foodAId`, `foodBId`).
 */
export const foodPairs = pgTable(
  "food_pairs",
  {
    foodAId: fk()
      .notNull()
      .references((): AnyPgColumn => foodItems.id, { onDelete: "cascade" }),
    foodBId: fk()
      .notNull()
      .references((): AnyPgColumn => foodItems.id, { onDelete: "cascade" }),
    coCount: integer().notNull().default(0),
    lift: real(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodAId, t.foodBId] }),
    index("food_pairs_a_idx").on(t.foodAId),
    index("food_pairs_b_idx").on(t.foodBId),
    check("food_pairs_order_check", sql`${t.foodAId} < ${t.foodBId}`),
    check("food_pairs_co_count_check", sql`${t.coCount} >= 0`),
  ],
);

/**
 * Per-user personalization (Phase 3, `docs/food-graph.md` §6.2). Derived from a
 * user's *own* recipes, it records the unit / variety / prep they most often use
 * for a given food, so the shared crowd suggestions can be re-ranked to float
 * "your usual" to the top. Composite PK (`userId`, `foodId`); rebuilt by the
 * ingestion job. `preferredVariantId` is reserved for when variety child nodes
 * are mined — the miner leaves it NULL until then.
 */
export const userFoodPrefs = pgTable(
  "user_food_prefs",
  {
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: "cascade" }),
    /** The unit this user most often measures this food in (canonical token). */
    preferredUnit: varchar({ length: 40 }),
    /** The variety this user reaches for (yellow onion), or NULL. */
    preferredVariantId: fk().references((): AnyPgColumn => foodItems.id, {
      onDelete: "set null",
    }),
    /** The prep this user most often applies (diced), or NULL. */
    preferredPrep: varchar({ length: 200 }),
    /** How many of this user's ingredient lines reference the food. */
    useCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.foodId] }),
    index("user_food_prefs_user_idx").on(t.userId),
    index("user_food_prefs_food_idx").on(t.foodId),
    check("user_food_prefs_use_count_check", sql`${t.useCount} >= 0`),
  ],
);

/**
 * Reverse index food → recipe (Phase 3). One row per (food, recipe) the food
 * appears in, with `useCount` = how many ingredient lines in that recipe
 * reference it. Powers `getRecipesUsingFood` ("recipes that use tomato") and, by
 * persisting the app-side canonicalization the miner computes, is the provenance
 * that a future *bounded* incremental ingestion can scope deltas by. Rebuilt by
 * the ingestion job; only live (non-tombstoned) recipes are linked. Composite PK
 * (`foodId`, `recipeId`), plus a `recipeId` index for the reverse lookup.
 */
export const foodRecipeLinks = pgTable(
  "food_recipe_links",
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: "cascade" }),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    useCount: integer().notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.recipeId] }),
    index("food_recipe_links_recipe_idx").on(t.recipeId),
    check("food_recipe_links_use_count_check", sql`${t.useCount} >= 1`),
  ],
);

export type FoodItemRow = typeof foodItems.$inferSelect;
export type NewFoodItem = typeof foodItems.$inferInsert;
export type FoodAliasRow = typeof foodAliases.$inferSelect;
export type NewFoodAlias = typeof foodAliases.$inferInsert;
export type FoodUnitStatRow = typeof foodUnitStats.$inferSelect;
export type NewFoodUnitStat = typeof foodUnitStats.$inferInsert;
export type FoodPrepStatRow = typeof foodPrepStats.$inferSelect;
export type NewFoodPrepStat = typeof foodPrepStats.$inferInsert;
export type FoodPairRow = typeof foodPairs.$inferSelect;
export type NewFoodPair = typeof foodPairs.$inferInsert;
export type UserFoodPrefRow = typeof userFoodPrefs.$inferSelect;
export type NewUserFoodPref = typeof userFoodPrefs.$inferInsert;
export type FoodRecipeLinkRow = typeof foodRecipeLinks.$inferSelect;
export type NewFoodRecipeLink = typeof foodRecipeLinks.$inferInsert;
