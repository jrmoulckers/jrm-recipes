import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { fk, pk, timestamps } from './_shared';
import { users } from './users';
import { recipes } from './recipes';

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
 * - {@link foodAliases}   . Every phrasing that resolves to a node.
 * - {@link foodUnitStats}: which units + typical quantities people use.
 * - {@link foodPrepStats}: which prep methods (diced, minced, …) people use.
 * - {@link foodPairs}     . Co-occurrence edges (the near-neighbour graph).
 *
 * The recipe editor's unit picker still reads the static `food-db.ts` module for
 * instant, offline, client-safe defaults. These tables let *server-side*
 * features (smart ingredient entry, near-neighbour suggestions, shopping-list
 * categorization, analytics) enrich those defaults with live crowd data.
 */
export const foodItems = pgTable(
  'food_items',
  {
    id: pk(),
    /** Stable, unique key derived from the food name. Also the seed id source. */
    slug: varchar({ length: 80 }).notNull().unique(),
    name: varchar({ length: 120 }).notNull(),
    /** Canonical {@link FoodCategory} string from `food-db.ts`. */
    category: varchar({ length: 40 }).notNull(),
    /** Approximate weigh-by density (g/mL), or NULL when measured by count. */
    densityGPerMl: real(),
    /**
     * Variety → canonical parent (yellow onion → onion). NULL for a canonical
     * node. Self-referential FK using the `AnyPgColumn` pattern. Deleting a
     * parent cascades to its varieties.
     */
    parentId: fk().references((): AnyPgColumn => foodItems.id, {
      onDelete: 'cascade',
    }),
    /** Provenance: `curated` (static seed) or `mined` (crowd corpus). */
    source: varchar({ length: 16 }).notNull().default('curated'),
    /**
     * Canonical {@link import("~/lib/allergens").Allergen} tokens this food
     * inherently carries (e.g. Cheese → `["dairy"]`), curated in
     * `src/lib/food-allergens.ts` and seeded here. This is the STRUCTURED source
     * of truth for `getRecipeAllergens`, which only falls back to the free-text
     * detector (`src/lib/allergens.ts`) for ingredient lines that don't resolve
     * to a food carrying curated allergen data. NULL means "not curated" (fall
     * back to text). An empty array would mean "curated, carries none". Additive
     * and nullable so the graph and old readers are untouched. Validation in
     * `food-allergens.ts` keeps the tokens aligned with the `Allergen` union.
     */
    allergens: text().array(),
    /** Denormalized popularity: distinct recipes that reference this node. */
    recipeCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index('food_items_category_idx').on(t.category),
    index('food_items_parent_idx').on(t.parentId),
    check('food_items_recipe_count_check', sql`${t.recipeCount} >= 0`),
  ],
);

/**
 * Every free-text phrasing that resolves to a food node. Curated aliases seed it
 * from `food-db.ts`. Mined aliases accrue from the corpus. `useCount` powers
 * "did you mean" ranking and the promotion of a frequent alias to a real
 * variety node. Unique per (`foodId`, `alias`). `alias` is normalized (see
 * `normalizeFoodText`) and indexed for resolution lookups.
 */
export const foodAliases = pgTable(
  'food_aliases',
  {
    id: pk(),
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    alias: varchar({ length: 160 }).notNull(),
    source: varchar({ length: 16 }).notNull().default('mined'),
    useCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique('food_aliases_food_alias_uq').on(t.foodId, t.alias),
    index('food_aliases_alias_idx').on(t.alias),
    check('food_aliases_use_count_check', sql`${t.useCount} >= 0`),
  ],
);

/**
 * Unit + quantity affinity per food, mined from `recipe_ingredients`. `unit` is
 * a canonical `units.ts` token where one exists. `p10`/`p50`/`p90` capture the
 * common-amount distribution (median + a sensible range) so the editor can
 * pre-fill a typical quantity. Composite PK (`foodId`, `unit`).
 */
export const foodUnitStats = pgTable(
  'food_unit_stats',
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
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
    index('food_unit_stats_food_idx').on(t.foodId),
    check('food_unit_stats_use_count_check', sql`${t.useCount} >= 0`),
  ],
);

/**
 * Prep-method affinity per food (diced, minced, softened, …), mined from the
 * `recipe_ingredients.prep` column. Composite PK (`foodId`, `prep`).
 */
export const foodPrepStats = pgTable(
  'food_prep_stats',
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    prep: varchar({ length: 200 }).notNull(),
    useCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.prep] }),
    index('food_prep_stats_food_idx').on(t.foodId),
    check('food_prep_stats_use_count_check', sql`${t.useCount} >= 0`),
  ],
);

/**
 * Co-occurrence edges for the near-neighbour graph. Each undirected pair is stored
 * once with `foodAId < foodBId` (enforced by a check) so there are no duplicate
 * mirror rows. `coCount` is the number of recipes containing both foods. `lift`
 * = P(A,B) / (P(A)·P(B)) is precomputed so distinctive pairings (onion→tomato)
 * outrank ubiquitous ones (onion→salt). Indexed on each side for neighbour
 * lookups. Composite PK (`foodAId`, `foodBId`).
 */
export const foodPairs = pgTable(
  'food_pairs',
  {
    foodAId: fk()
      .notNull()
      .references((): AnyPgColumn => foodItems.id, { onDelete: 'cascade' }),
    foodBId: fk()
      .notNull()
      .references((): AnyPgColumn => foodItems.id, { onDelete: 'cascade' }),
    coCount: integer().notNull().default(0),
    lift: real(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodAId, t.foodBId] }),
    index('food_pairs_a_idx').on(t.foodAId),
    index('food_pairs_b_idx').on(t.foodBId),
    check('food_pairs_order_check', sql`${t.foodAId} < ${t.foodBId}`),
    check('food_pairs_co_count_check', sql`${t.coCount} >= 0`),
  ],
);

/**
 * Per-user personalization (Phase 3, `docs/food-graph.md` §6.2). Derived from a
 * user's *own* recipes, it records the unit / variety / prep they most often use
 * for a given food, so the shared crowd suggestions can be re-ranked to float
 * "your usual" to the top. Composite PK (`userId`, `foodId`). Rebuilt by the
 * ingestion job. `preferredVariantId` is reserved for when variety child nodes
 * are mined. The miner leaves it NULL until then.
 */
export const userFoodPrefs = pgTable(
  'user_food_prefs',
  {
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    /** The unit this user most often measures this food in (canonical token). */
    preferredUnit: varchar({ length: 40 }),
    /** The variety this user reaches for (yellow onion), or NULL. */
    preferredVariantId: fk().references((): AnyPgColumn => foodItems.id, {
      onDelete: 'set null',
    }),
    /** The prep this user most often applies (diced), or NULL. */
    preferredPrep: varchar({ length: 200 }),
    /** How many of this user's ingredient lines reference the food. */
    useCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.foodId] }),
    index('user_food_prefs_user_idx').on(t.userId),
    index('user_food_prefs_food_idx').on(t.foodId),
    check('user_food_prefs_use_count_check', sql`${t.useCount} >= 0`),
  ],
);

/**
 * Reverse index food → recipe (Phase 3). One row per (food, recipe) the food
 * appears in, with `useCount` = how many ingredient lines in that recipe
 * reference it. Powers `getRecipesUsingFood` ("recipes that use tomato") and, by
 * persisting the app-side canonicalization the miner computes, is the provenance
 * that a future *bounded* incremental ingestion can scope deltas by. The ingestion
 * job rebuilds it. Only live (non-tombstoned) recipes are linked. A composite PK
 * (`foodId`, `recipeId`) plus a `recipeId` index support the reverse lookup.
 */
export const foodRecipeLinks = pgTable(
  'food_recipe_links',
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    useCount: integer().notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.recipeId] }),
    index('food_recipe_links_recipe_idx').on(t.recipeId),
    check('food_recipe_links_use_count_check', sql`${t.useCount} >= 1`),
  ],
);

/**
 * The nutrient registry (issue #1028). One row per nutrient the app knows about,
 * mirroring the static `src/lib/nutrients.ts` declaration the way
 * `food_nutrition` mirrors `food-nutrition.ts`: the module is the source of
 * truth, the table is the seeded, joinable copy.
 *
 * Its reason to exist is {@link foodNutrients}: a vector needs somewhere to
 * declare what its keys *mean*. The %DV bands and rounding rules the Nutrition
 * Facts panel used to hardcode are rows here, so adding cholesterol, potassium,
 * added sugars or vitamin D is a seed entry rather than a migration plus six
 * coordinated edits.
 *
 * `id` is the stable per-100 g identifier (`kcal`, `proteinG`, `satFatG`, …) and
 * is referenced by `food_nutrients.nutrient_id`. `dailyValue` is NULL for a
 * nutrient the app does not band.
 */
export const nutrients = pgTable(
  'nutrients',
  {
    /** Stable nutrient identifier, e.g. `kcal`, `proteinG`, `satFatG`. */
    id: varchar({ length: 40 }).primaryKey(),
    /** English display label; localized labels live in `messages/*.json`. */
    label: varchar({ length: 60 }).notNull(),
    /** Display unit (`kcal`, `g`, `mg`), identical on both bases. */
    unit: varchar({ length: 12 }).notNull(),
    /** FDA Daily Value for %DV banding, or NULL when the app doesn't band it. */
    dailyValue: real(),
    /** Fractional digits shown (energy and sodium are whole numbers). */
    displayPrecision: integer().notNull().default(0),
    /** Nutrition Facts panel order. Sparse so a nutrient can be slotted between. */
    displayOrder: integer().notNull(),
    /** One of the four headline macros (calories, protein, fat, carbohydrate). */
    isMacro: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index('nutrients_display_order_idx').on(t.displayOrder),
    check('nutrients_daily_value_check', sql`${t.dailyValue} IS NULL OR ${t.dailyValue} > 0`),
    check('nutrients_precision_check', sql`${t.displayPrecision} >= 0`),
  ],
);

/**
 * Per-food nutrient **vector** (issue #1028): one row per (food, nutrient),
 * replacing the fixed nutrient columns on {@link foodNutrition}.
 *
 * The old shape modelled nutrients as *schema* when they are *data*. That cost
 * a migration per nutrient, and it had already produced a defect —
 * `recipes.saturated_fat_grams` existed while `food_nutrition` had no
 * saturated-fat column, so no estimate could ever populate it. A vector makes
 * saturated fat a seed entry, and cholesterol, potassium, added sugars and
 * vitamin D likewise.
 *
 * A row's absence means *unknown*, never zero: source coverage is uneven and a
 * confident `0` is a claim the data doesn't support. Provenance stays on
 * {@link foodNutrition} (`sourceRef`), which remains the per-food record.
 * Composite PK (`foodId`, `nutrientId`) — one amount per food per nutrient.
 */
export const foodNutrients = pgTable(
  'food_nutrients',
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    nutrientId: varchar({ length: 40 })
      .notNull()
      .references(() => nutrients.id, { onDelete: 'cascade' }),
    /** Amount of this nutrient per 100 g of the food's edible portion. */
    per100g: real().notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.nutrientId] }),
    index('food_nutrients_nutrient_idx').on(t.nutrientId),
    check('food_nutrients_value_check', sql`${t.per100g} >= 0`),
  ],
);

/**
 * Per-food nutrition provenance (Phase 4, `docs/food-graph.md` §8, ADR-4).
 * Unlike the affinity tables this is **not** crowd-mined: it mirrors the
 * curated, public-domain static dataset in `src/lib/food-nutrition.ts` (USDA
 * FoodData Central), seeded by `seed-ingredients.ts`, and is left untouched by
 * the graph-mining recompute. `foodId` is the PK (one row per node) and
 * `sourceRef` carries the FDC id.
 * Nutrient amounts live exclusively in {@link foodNutrients}; do not add them
 * here.
 */
export const foodNutrition = pgTable(
  'food_nutrition',
  {
    foodId: fk()
      .primaryKey()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    /** Provenance. The USDA FDC id (or other authoritative reference). */
    sourceRef: varchar({ length: 64 }).notNull(),
    ...timestamps(),
  },
  (t) => [index('food_nutrition_source_idx').on(t.sourceRef)],
);

/**
 * Household-measure → grams per canonical food (issue #1025, ADR-0006). The
 * missing edge in the unit graph: mass converts to grams arithmetically and
 * volume converts via `densityGPerMl`, but the `count` dimension has no
 * universal conversion, because the grams in "1 onion" are a property of the
 * *food*, not of the unit. Without this table every `2 eggs` / `3 cloves garlic`
 * / `1 bunch parsley` line contributed nothing to a nutrition roll-up, and the
 * 79 of 137 curated foods that carry no density had no gram path at all.
 *
 * Like {@link foodNutrition} this is curated, not crowd-mined: it mirrors the
 * static dataset in `src/lib/food-portions.ts` (validated USDA FoodData Central
 * `food_portion` gram weights plus explicitly labelled kitchen estimates) and is
 * left untouched by the graph-mining recompute. `unit` is stored normalized and singular (see
 * `normalizePortionUnit`) so `cloves` and `clove` resolve the same row.
 * Composite PK (`foodId`, `unit`) — one weight per food per measure.
 */
export const foodPortions = pgTable(
  'food_portions',
  {
    foodId: fk()
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    /** Normalized, singular unit token (`each`, `clove`, `bunch`, `cup`). */
    unit: varchar({ length: 40 }).notNull(),
    /** Grams in exactly one `unit` of this food. Always > 0. */
    gramsPerUnit: real().notNull(),
    /**
     * What "one" means when the bare unit is ambiguous — `medium`, `head`,
     * `drained`, `shredded`. Provenance and display only; never matched on.
     */
    modifier: varchar({ length: 60 }),
    /** `usda` (recorded FDC `food_portion`) or `kitchen` (hand estimate). */
    source: varchar({ length: 16 }).notNull().default('usda'),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.unit] }),
    index('food_portions_food_idx').on(t.foodId),
    check('food_portions_grams_check', sql`${t.gramsPerUnit} > 0`),
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
export type FoodNutritionRow = typeof foodNutrition.$inferSelect;
export type NewFoodNutrition = typeof foodNutrition.$inferInsert;
export type NutrientRow = typeof nutrients.$inferSelect;
export type NewNutrient = typeof nutrients.$inferInsert;
export type FoodNutrientRow = typeof foodNutrients.$inferSelect;
export type NewFoodNutrient = typeof foodNutrients.$inferInsert;
export type FoodPortionRow = typeof foodPortions.$inferSelect;
export type NewFoodPortion = typeof foodPortions.$inferInsert;
