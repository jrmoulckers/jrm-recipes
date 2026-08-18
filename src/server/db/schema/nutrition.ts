import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import type { UnresolvedLine } from '~/lib/food-grams';
import type { Nutrition } from '~/lib/nutrition';

import { fk, timestamps } from './_shared';
import { recipes } from './recipes';

/**
 * The derived nutrition cache (issue #1044, ADR-0007).
 *
 * One row per recipe holding the answer `getRecipeNutritionView` would compute,
 * so search filters, planner roll-ups and cook-log totals can read a recipe's
 * per-serving macros without resolving its ingredient lines against the food
 * graph on every request.
 *
 * Three things make this cache safe to keep, and each of them was a lesson from
 * the layers below (`docs/architecture/0006-portion-based-gram-resolution.md`):
 *
 * 1. **It is versioned.** `resolverVersion` records the resolver the values were
 *    produced by — a hand-bumped algorithm number plus a content hash of the
 *    curated portions, densities, facts, confidence tiers and nutrient registry
 *    (`src/lib/nutrition-version.ts`). A row whose version no longer matches is
 *    a miss, not a value. Without this, changing a portion weight would not make
 *    one row look wrong; it would make every row silently disagree forever.
 * 2. **It carries its provenance.** `source` and `confidence` are stored with
 *    the numbers, so a cached estimate can never be mistaken for a cook's own
 *    figures — the exact ambiguity #1029 removed by making provenance a value.
 * 3. **It distinguishes absent from zero.** `perServing` is JSON, and a nutrient
 *    nothing sourced is simply not a key. Storing fixed numeric columns would
 *    have re-introduced the confident `0` that #1028 eliminated.
 *
 * `manual` is deliberately **not** a storable `source`: a cook's own numbers
 * live on `recipes` already and short-circuit the resolver before any database
 * read, so caching them would duplicate a value that is not derived.
 *
 * Rows are deleted inside the recipe-save transaction and re-populated after it
 * commits, so a stale row cannot outlive an edit (see `nutrition-cache.ts`).
 */
export const recipeNutritionCache = pgTable(
  'recipe_nutrition_cache',
  {
    /** The recipe these figures describe. One row per recipe; dies with it. */
    recipeId: fk()
      .primaryKey()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    /**
     * The resolver that produced these values, e.g. `n1.4kq2p1x0z`. Compared
     * against `nutritionResolverVersion()` on every read; a mismatch is a miss.
     */
    resolverVersion: varchar({ length: 40 }).notNull(),
    /**
     * The provenance tag: `graph` (resolved via each line's `foodId`),
     * `estimate` (free-text match against the curated dataset), or `none`
     * (nothing could be sourced — a real, cacheable answer). Never `manual`.
     */
    source: varchar({ length: 16 }).notNull(),
    /**
     * Per-serving macros in the app's `Nutrition` key space. **Partial by
     * construction**: an absent key means the nutrient was never sourced, which
     * is not the same claim as `0`.
     */
    perServing: jsonb().$type<Nutrition>().notNull(),
    /** 0–1 aggregate confidence (#1027), or NULL when `source` is `none`. */
    confidence: real(),
    /** Ingredient lines that contributed to the totals. */
    sourcedLines: integer(),
    /** Ingredient lines considered. */
    totalLines: integer(),
    /**
     * The lines that contributed nothing, by name and reason (#1027). Round
     * trips through the cache rather than being recomputed: recomputing it means
     * resolving every line against the graph, which is the exact work the cache
     * exists to avoid.
     */
    unresolvedLines: jsonb().$type<UnresolvedLine[]>(),
    /**
     * `recipes.updated_at` as observed when the values were computed. The write
     * is conditional on this still matching, so a slow refresh racing a newer
     * save can never overwrite fresher values with older ones.
     */
    recipeUpdatedAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    // Lets the backfill find rows left behind by an older resolver without
    // scanning every recipe's payload.
    index('recipe_nutrition_cache_version_idx').on(t.resolverVersion),
    check('recipe_nutrition_cache_source_check', sql`${t.source} IN ('graph', 'estimate', 'none')`),
    check(
      'recipe_nutrition_cache_confidence_check',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
    check(
      'recipe_nutrition_cache_lines_check',
      sql`(${t.sourcedLines} IS NULL OR ${t.sourcedLines} >= 0) AND (${t.totalLines} IS NULL OR ${t.totalLines} >= 0)`,
    ),
  ],
);

export type RecipeNutritionCacheRow = typeof recipeNutritionCache.$inferSelect;
export type NewRecipeNutritionCache = typeof recipeNutritionCache.$inferInsert;
