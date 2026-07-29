import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { canonicalFood, normalizeFoodText } from "~/lib/food-db";
import {
  rankNeighbours,
  rankUnitStats,
  type PairEdge,
  type UnitStatRow,
} from "~/lib/food-mining";
import {
  dimensionForUnit,
  getSuggestedUnitsForFood,
  mergeLearnedUnits,
  type FoodDimension,
  type SuggestedUnit,
} from "~/lib/food-units";
import { db, isDbConfigured } from "~/server/db";
import {
  foodAliases,
  foodItems,
  foodPairs,
  foodPrepStats,
  foodUnitStats,
  recipeIngredients,
} from "~/server/db/schema";

/**
 * Server-side serving layer for the live food graph (see `docs/food-graph.md`).
 * These "smart ingredient entry" queries enrich the static defaults in
 * `food-db.ts` / `food-units.ts` with crowd-mined data: a food's varieties, the
 * units + typical quantities people use for it, its common prep methods, and its
 * near-neighbours in the co-occurrence graph.
 *
 * The pure ranking lives in `food-mining.ts` (unit-tested); each function here
 * just fetches rows and delegates. All functions degrade gracefully — with no
 * database configured they return empty/fallback data, so the editor keeps its
 * synchronous static suggestions offline. `getSuggestedUnitsForFood` itself is
 * intentionally *not* re-exported here; it stays pure/synchronous in
 * `food-units.ts` for the client picker (ADR-5, additive API).
 */

/** A resolved canonical food node. */
export type FoodMatch = {
  id: string;
  slug: string;
  name: string;
  category: string;
  source: string;
};

/** A variety child of a canonical food (yellow onion → onion). */
export type FoodVariant = {
  id: string;
  slug: string;
  name: string;
  recipeCount: number;
};

/** A common (unit, quantity-distribution) a food is measured in. */
export type QuantitySuggestion = {
  unit: string;
  dimension: FoodDimension;
  useCount: number;
  /** Typical low / median / high amount for this (food, unit). */
  p10: number | null;
  p50: number | null;
  p90: number | null;
};

/** A common prep method for a food. */
export type PrepSuggestion = { prep: string; useCount: number };

/** A near-neighbour food suggestion (co-occurs with the query foods). */
export type FoodSuggestion = {
  id: string;
  slug: string;
  name: string;
  category: string;
  coCount: number;
  lift: number;
};

/**
 * Resolve free text to a canonical node id. Tries the static canonicalizer first
 * (fast, offline, covers the curated backbone); falls back to the mined
 * `food_aliases` table for foods that exist only in the corpus.
 */
async function resolveNodeId(
  item: string | null | undefined,
): Promise<string | null> {
  const canon = canonicalFood(item);
  if (canon) return canon.id;
  if (!isDbConfigured()) return null;
  const alias = normalizeFoodText(item);
  if (!alias) return null;
  const [row] = await db
    .select({ foodId: foodAliases.foodId })
    .from(foodAliases)
    .where(eq(foodAliases.alias, alias))
    .orderBy(desc(foodAliases.useCount))
    .limit(1);
  return row?.foodId ?? null;
}

/** Resolve a free-text ingredient to its canonical food node, or `null`. */
export async function getFoodMatch(
  item: string | null | undefined,
): Promise<FoodMatch | null> {
  const id = await resolveNodeId(item);
  if (!id || !isDbConfigured()) {
    const canon = canonicalFood(item);
    return canon
      ? { ...canon, category: canon.category, source: "curated" }
      : null;
  }
  const [row] = await db
    .select({
      id: foodItems.id,
      slug: foodItems.slug,
      name: foodItems.name,
      category: foodItems.category,
      source: foodItems.source,
    })
    .from(foodItems)
    .where(eq(foodItems.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The varieties of a food (its child nodes), most-popular first. Empty when the
 * food is unknown, has no varieties, or no DB is configured.
 */
export async function getVariantsForFood(
  item: string | null | undefined,
  options: { limit?: number } = {},
): Promise<FoodVariant[]> {
  if (!isDbConfigured()) return [];
  const id = await resolveNodeId(item);
  if (!id) return [];
  const rows = await db
    .select({
      id: foodItems.id,
      slug: foodItems.slug,
      name: foodItems.name,
      recipeCount: foodItems.recipeCount,
    })
    .from(foodItems)
    .where(eq(foodItems.parentId, id))
    .orderBy(desc(foodItems.recipeCount))
    .limit(options.limit ?? 12);
  return rows;
}

/**
 * The units + typical quantities the corpus uses for a food, most-used first.
 * Pass `unit` to fetch just that unit's distribution.
 */
export async function getCommonQuantitiesForFood(
  item: string | null | undefined,
  options: { unit?: string; limit?: number; minUseCount?: number } = {},
): Promise<QuantitySuggestion[]> {
  if (!isDbConfigured()) return [];
  const id = await resolveNodeId(item);
  if (!id) return [];
  const where = options.unit
    ? and(eq(foodUnitStats.foodId, id), eq(foodUnitStats.unit, options.unit))
    : eq(foodUnitStats.foodId, id);
  const rows = await db
    .select({
      unit: foodUnitStats.unit,
      useCount: foodUnitStats.useCount,
      p10: foodUnitStats.p10,
      p50: foodUnitStats.p50,
      p90: foodUnitStats.p90,
    })
    .from(foodUnitStats)
    .where(where);
  return rankUnitStats(rows satisfies UnitStatRow[], {
    minUseCount: options.minUseCount,
    limit: options.limit,
  }).map((r) => ({
    unit: r.unit,
    dimension: dimensionForUnit(r.unit),
    useCount: r.useCount,
    p10: r.p10,
    p50: r.p50,
    p90: r.p90,
  }));
}

/**
 * The picker's unit suggestions for a food, enriched with learned usage: units
 * the corpus actually uses lead (by popularity), then the static category
 * fallback. Same flat, ordered {@link SuggestedUnit} shape as
 * `getSuggestedUnitsForFood` (index 0 = default), so callers can swap in the
 * live version when online and fall back to the sync one offline.
 */
export async function getLearnedUnitsForFood(
  item: string | null | undefined,
): Promise<SuggestedUnit[]> {
  const fallback = getSuggestedUnitsForFood(item);
  const learned = await getCommonQuantitiesForFood(item);
  return mergeLearnedUnits(learned, fallback);
}

/** The common prep methods for a food, most-used first. */
export async function getPrepsForFood(
  item: string | null | undefined,
  options: { limit?: number; minUseCount?: number } = {},
): Promise<PrepSuggestion[]> {
  if (!isDbConfigured()) return [];
  const id = await resolveNodeId(item);
  if (!id) return [];
  const minUseCount = options.minUseCount ?? 1;
  const rows = await db
    .select({ prep: foodPrepStats.prep, useCount: foodPrepStats.useCount })
    .from(foodPrepStats)
    .where(eq(foodPrepStats.foodId, id))
    .orderBy(desc(foodPrepStats.useCount))
    .limit(options.limit ?? 8);
  return rows.filter((r) => r.useCount >= minUseCount);
}

/**
 * Near-neighbour foods for one or more ingredients already in a recipe — the
 * "you might also add…" signal. Ranks the co-occurrence graph by lift, excludes
 * the query foods themselves, and returns the strongest partners.
 */
export async function getPairedFoods(
  items: readonly (string | null | undefined)[],
  options: { limit?: number; minCoCount?: number } = {},
): Promise<FoodSuggestion[]> {
  if (!isDbConfigured() || items.length === 0) return [];
  const ids = (await Promise.all(items.map(resolveNodeId))).filter(
    (id): id is string => id != null,
  );
  if (ids.length === 0) return [];

  const edges: PairEdge[] = await db
    .select({
      foodAId: foodPairs.foodAId,
      foodBId: foodPairs.foodBId,
      coCount: foodPairs.coCount,
      lift: foodPairs.lift,
    })
    .from(foodPairs)
    .where(or(inArray(foodPairs.foodAId, ids), inArray(foodPairs.foodBId, ids)));

  const ranked = rankNeighbours(edges, ids, {
    minCoCount: options.minCoCount,
    limit: options.limit ?? 8,
  });
  if (ranked.length === 0) return [];

  const nodeRows = await db
    .select({
      id: foodItems.id,
      slug: foodItems.slug,
      name: foodItems.name,
      category: foodItems.category,
    })
    .from(foodItems)
    .where(
      inArray(
        foodItems.id,
        ranked.map((r) => r.foodId),
      ),
    );
  const byId = new Map(nodeRows.map((n) => [n.id, n]));

  return ranked.flatMap((r) => {
    const node = byId.get(r.foodId);
    return node
      ? [{ ...node, coCount: r.coCount, lift: r.lift }]
      : [];
  });
}

/**
 * "You might also add…" for a whole recipe: reads the recipe's current
 * ingredients and returns the strongest co-occurrence partners not already in
 * it. A thin convenience over {@link getPairedFoods} for the recipe editor /
 * detail page (the editor can also call `getPairedFoods` directly with the
 * ingredients being typed). Empty when the recipe is unknown, has no matched
 * ingredients, or no DB is configured. Copy: `foodGraph.pairings`.
 */
export async function getSuggestedAdditions(
  recipeId: string,
  options: { limit?: number; minCoCount?: number } = {},
): Promise<FoodSuggestion[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ item: recipeIngredients.item })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipeId));
  if (rows.length === 0) return [];
  return getPairedFoods(
    rows.map((r) => r.item),
    options,
  );
}
