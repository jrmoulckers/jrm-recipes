/**
 * Pure, dependency-free resolution of a free-text ingredient phrasing to a
 * canonical `food_items.id`. This is the write-time counterpart to the corpus
 * miner's canonicalization: where the miner mines the corpus *after* the fact,
 * this maps a single ingredient line onto a node *as it is saved* so downstream
 * features (nutrition, allergens, ingredient search) can rely on a structured
 * food identity instead of free text.
 *
 * Kept free of `db`/`postgres`/`server-only` (like `food-mining.ts` and
 * `seed-ingredients.ts`) so the resolution logic is unit-testable without a
 * database and can be reused by the standalone backfill script. The server
 * wrapper in `src/server/db/resolve-food.ts` supplies the live alias index from
 * `food_aliases`. The curated static dataset (`food-db.ts`) is the fallback.
 */

import { canonicalFood, normalizeFoodText } from "./food-db";

/** The alias width `food_aliases.alias` is stored at (mirrors the seed/miner). */
const ALIAS_MAX = 160;

/** One `food_aliases` row, as needed to build the resolution index. */
export type AliasRow = { alias: string; foodId: string; useCount?: number };

/**
 * The normalized-alias → canonical `food_items.id` lookup. Keys are the same
 * `normalizeFoodText(...).slice(0, 160)` phrasings the seed and miner store, so
 * an ingredient normalized the same way hits directly.
 */
export type AliasIndex = Map<string, string>;

/**
 * Build the resolution index from `food_aliases` rows. When several nodes share
 * a normalized alias (rare. The table's uniqueness is per `(foodId, alias)`),
 * the more-used node wins, tie-broken lexicographically on `foodId` so the same
 * rows always yield the same index. Aliases are re-normalized defensively.
 */
export function buildAliasIndex(rows: readonly AliasRow[]): AliasIndex {
  const best = new Map<string, { foodId: string; useCount: number }>();
  for (const row of rows) {
    const alias = normalizeFoodText(row.alias).slice(0, ALIAS_MAX);
    if (!alias) continue;
    const useCount = row.useCount ?? 0;
    const prev = best.get(alias);
    if (
      !prev ||
      useCount > prev.useCount ||
      (useCount === prev.useCount && row.foodId < prev.foodId)
    ) {
      best.set(alias, { foodId: row.foodId, useCount });
    }
  }
  const index: AliasIndex = new Map();
  for (const [alias, { foodId }] of best) index.set(alias, foodId);
  return index;
}

/**
 * Resolve one free-text ingredient `item` to a canonical `food_items.id`, or
 * `null` when nothing matches. Exact match against the (live) alias index first,
 * which also resolves variety phrasings ("yellow onion") onto their own node
 * when such an alias exists, then the curated static fallback ({@link
 * canonicalFood}), which does whole-word phrase matching over the seeded dataset.
 * Pure + deterministic.
 */
export function pickFoodId(
  item: string | null | undefined,
  aliasIndex: AliasIndex,
): string | null {
  const normalized = normalizeFoodText(item).slice(0, ALIAS_MAX);
  if (normalized) {
    const hit = aliasIndex.get(normalized);
    if (hit) return hit;
  }
  return canonicalFood(item)?.id ?? null;
}
