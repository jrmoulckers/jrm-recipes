import "server-only";

import { inArray } from "drizzle-orm";

import { buildAliasIndex, pickFoodId } from "~/lib/food-resolve";
import { normalizeFoodText } from "~/lib/food-db";
import { db, isDbConfigured } from "~/server/db";
import { foodAliases, foodItems } from "~/server/db/schema";

/**
 * Write-time resolution of free-text ingredient lines onto canonical
 * `food_items` nodes (see `docs/food-graph.md`). Given the raw `item` strings a
 * recipe write is about to persist, it returns the `food_items.id` each resolves
 * to (or `null`), so `recipe_ingredients.foodId` can be populated as the recipe
 * is saved.
 *
 * Resolution reuses the shared pure core (`~/lib/food-resolve`): an exact match
 * against the live `food_aliases` index first (which also covers mined phrasings
 * and variety nodes), then the curated static dataset as a fallback.
 *
 * **Best-effort and resilient by contract**: this never throws. Any failure —
 * no database configured, a query error — resolves everything to `null` so a
 * recipe save is never blocked by graph resolution. Every returned non-null id
 * is verified to exist in `food_items`, so the FK can never be violated.
 */

const ALIAS_MAX = 160;

/**
 * A Drizzle executor that can run the read queries — either the pooled {@link db}
 * or an open transaction handle. Callers that are **inside a transaction must
 * pass their `tx`**: in production the connection pool is `max: 1`, so issuing
 * these reads through the global `db` while the caller's transaction holds that
 * one connection deadlocks the request (it waits forever for a second
 * connection) until the serverless function times out. Running them on the
 * transaction's own connection avoids that entirely.
 */
type FoodResolveExecutor = Pick<typeof db, "select">;

/** Resolve a batch of ingredient `item` strings to `food_items.id`s (or null). */
export async function resolveFoodIds(
  items: readonly string[],
  executor: FoodResolveExecutor = db,
): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  const nulls = () => items.map(() => null);
  if (!isDbConfigured()) return nulls();

  try {
    // Distinct normalized aliases we actually need, so the lookup stays small.
    const wanted = new Set<string>();
    for (const item of items) {
      const normalized = normalizeFoodText(item).slice(0, ALIAS_MAX);
      if (normalized) wanted.add(normalized);
    }

    const aliasRows =
      wanted.size > 0
        ? await executor
            .select({
              alias: foodAliases.alias,
              foodId: foodAliases.foodId,
              useCount: foodAliases.useCount,
            })
            .from(foodAliases)
            .where(inArray(foodAliases.alias, [...wanted]))
        : [];

    const index = buildAliasIndex(aliasRows);
    const candidates = items.map((item) => pickFoodId(item, index));

    // Verify every candidate node exists so a curated-fallback id that isn't
    // seeded in this database can't produce an FK violation on insert.
    const distinct = [
      ...new Set(candidates.filter((id): id is string => !!id)),
    ];
    const existing =
      distinct.length > 0
        ? new Set(
            (
              await executor
                .select({ id: foodItems.id })
                .from(foodItems)
                .where(inArray(foodItems.id, distinct))
            ).map((r) => r.id),
          )
        : new Set<string>();

    return candidates.map((id) => (id && existing.has(id) ? id : null));
  } catch {
    // Resolution must never block a save (docs/food-graph.md).
    return nulls();
  }
}

/** Resolve a single ingredient `item` to its `food_items.id`, or `null`. */
export async function resolveFoodId(
  item: string,
  executor: FoodResolveExecutor = db,
): Promise<string | null> {
  const [id] = await resolveFoodIds([item], executor);
  return id ?? null;
}
