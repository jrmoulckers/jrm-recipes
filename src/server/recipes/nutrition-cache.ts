import { and, eq, inArray, sql } from 'drizzle-orm';

import type { UnresolvedLine } from '~/lib/food-grams';
import { NUTRIENTS, type Nutrition } from '~/lib/nutrition';
import { nutritionResolverVersion } from '~/lib/nutrition-version';
import { emptyNutritionView, type RecipeNutritionView } from '~/lib/recipe-nutrition';
import { recipeNutritionCache } from '~/server/db/schema/nutrition';

import { computeRecipeNutritionView, type NutritionDb } from './nutrition-compute';

/**
 * The derived nutrition cache: read, write, and invalidate (issue #1044,
 * ADR-0007).
 *
 * ## Write strategy: invalidate in the transaction, refresh after it commits
 *
 * There is deliberately **no read-and-write-through**. A recipe page can be
 * requested concurrently by many readers, and having each of them race to
 * populate the same row is how a cache ends up holding whichever computation
 * happened to finish last — including one that started before an edit and
 * finished after it.
 *
 * Instead:
 *
 * 1. **Invalidate inside the write transaction.** {@link invalidateNutritionCache}
 *    deletes the row in the same transaction that rewrites the recipe's
 *    ingredient lines, so the delete commits atomically with the edit. There is
 *    no window in which the new lines and the old numbers are both visible.
 * 2. **Refresh after the commit**, best-effort. {@link refreshNutritionCache}
 *    recomputes and writes, guarded twice: it writes nothing if the recipe has
 *    changed again since the values were computed, and its upsert refuses to
 *    replace a row derived from a *newer* recipe state than its own.
 * 3. **Reads never write.** A miss computes and returns; the request path is
 *    pure. The cost of a miss is exactly what every read cost before this
 *    existed.
 *
 * The consequence is the one worth having: **staleness is impossible, only
 * misses are.** Every failure mode here — a failed refresh, a lost race, an
 * unreachable database — degrades to recomputation, never to a wrong number.
 */

/** The per-serving payload actually stored, plus its provenance. */
export type NutritionCacheValues = {
  source: 'graph' | 'estimate' | 'none';
  perServing: Nutrition;
  confidence: number | null;
  sourcedLines: number | null;
  totalLines: number | null;
  unresolvedLines: UnresolvedLine[] | null;
};

/**
 * Keep only nutrients the registry declares, and only real numbers.
 *
 * This is the absent-vs-zero guard, and it runs in **both** directions. After
 * #1028 a nutrient nothing sourced is *absent*, not `0`, and the two are
 * different claims: absent means "unknown", `0` means "measured, and there is
 * none". A serializer that normalized absent keys to `0` (or a deserializer that
 * defaulted them) would reintroduce exactly the confident falsehood #1028
 * removed — and would do it silently, because both shapes render.
 *
 * `null` is dropped as well as `undefined`: the `Nutrition` type admits `null`
 * for rows read straight from `recipes`, and a stored `null` is just a
 * heavier-weight absence.
 */
export function sanitizeNutrition(value: unknown): Nutrition {
  const out: Nutrition = {};
  if (typeof value !== 'object' || value === null) return out;
  const record = value as Record<string, unknown>;
  for (const { key } of NUTRIENTS) {
    const v = record[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

function sanitizeUnresolved(value: unknown): UnresolvedLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const reason = record.reason;
    if (reason !== 'weight' && reason !== 'facts') return [];
    return [{ label: typeof record.label === 'string' ? record.label : '', reason }];
  });
}

/**
 * Project a computed view onto what gets stored, or `null` when it must not be
 * stored at all.
 *
 * A `manual` view is never cached: the cook's own numbers already live on
 * `recipes` and short-circuit the resolver before any database read, so a cached
 * copy would be a duplicate of a value that is not derived — and a cached number
 * that could be mistaken for a manual override is precisely the ambiguity #1029
 * removed.
 */
export function toCacheValues(view: RecipeNutritionView): NutritionCacheValues | null {
  const p = view.provenance;
  if (p.source === 'manual') return null;
  if (p.source === 'none') {
    return {
      source: 'none',
      perServing: {},
      confidence: null,
      sourcedLines: null,
      totalLines: null,
      unresolvedLines: null,
    };
  }
  return {
    source: p.source,
    perServing: sanitizeNutrition(view.perServing),
    confidence: p.confidence,
    sourcedLines: p.sourcedLines,
    totalLines: p.totalLines,
    // Round-tripped rather than recomputed: recomputing the named lines means
    // resolving every ingredient against the graph again, which is the whole of
    // the work the cache exists to avoid (#1027).
    unresolvedLines: [...p.unresolvedLines],
  };
}

/**
 * Rebuild a view from a stored row. The inverse of {@link toCacheValues}, and
 * total: any row shape that survives the column checks yields a usable view.
 */
export function fromCacheValues(values: {
  source: string;
  perServing: unknown;
  confidence: number | null;
  sourcedLines: number | null;
  totalLines: number | null;
  unresolvedLines: unknown;
}): RecipeNutritionView {
  if (values.source !== 'graph' && values.source !== 'estimate') return emptyNutritionView();
  return {
    perServing: sanitizeNutrition(values.perServing),
    provenance: {
      source: values.source,
      confidence: values.confidence ?? 0,
      sourcedLines: values.sourcedLines ?? 0,
      totalLines: values.totalLines ?? 0,
      unresolvedLines: sanitizeUnresolved(values.unresolvedLines),
    },
  };
}

/**
 * Read a recipe's cached nutrition view, or `null` for a miss.
 *
 * A row stamped with a different resolver version **is** a miss: it was produced
 * by different portion weights, densities, confidence tiers or nutrient
 * registry, so its numbers answer a question nobody is asking any more. Filtered
 * in SQL rather than in code so a stale row costs nothing to skip.
 *
 * Never throws — a cache that cannot be read is a cache miss.
 */
export async function readCachedNutritionView(
  db: NutritionDb,
  recipeId: string,
): Promise<RecipeNutritionView | null> {
  try {
    const [row] = await db
      .select({
        source: recipeNutritionCache.source,
        perServing: recipeNutritionCache.perServing,
        confidence: recipeNutritionCache.confidence,
        sourcedLines: recipeNutritionCache.sourcedLines,
        totalLines: recipeNutritionCache.totalLines,
        unresolvedLines: recipeNutritionCache.unresolvedLines,
      })
      .from(recipeNutritionCache)
      .where(
        and(
          eq(recipeNutritionCache.recipeId, recipeId),
          eq(recipeNutritionCache.resolverVersion, nutritionResolverVersion()),
        ),
      )
      .limit(1);
    return row ? fromCacheValues(row) : null;
  } catch {
    return null;
  }
}

/**
 * Read many recipes' cached views in **one** query, keyed by recipe id. A recipe
 * absent from the returned map is a miss, exactly as `null` is for
 * {@link readCachedNutritionView}.
 *
 * This is the whole point of the batch path (#1048): a planned week is 20-odd
 * recipes, and asking the cache 20 times in a loop is the N+1 the cache was
 * supposed to make unnecessary. Same table, same resolver-version filter, same
 * deserializer — only the cardinality differs, so a batched answer can never
 * disagree with a single one.
 *
 * Never throws — a cache that cannot be read is a set of misses.
 */
export async function readCachedNutritionViews(
  db: NutritionDb,
  recipeIds: readonly string[],
): Promise<Map<string, RecipeNutritionView>> {
  const out = new Map<string, RecipeNutritionView>();
  if (recipeIds.length === 0) return out;
  try {
    const rows = await db
      .select({
        recipeId: recipeNutritionCache.recipeId,
        source: recipeNutritionCache.source,
        perServing: recipeNutritionCache.perServing,
        confidence: recipeNutritionCache.confidence,
        sourcedLines: recipeNutritionCache.sourcedLines,
        totalLines: recipeNutritionCache.totalLines,
        unresolvedLines: recipeNutritionCache.unresolvedLines,
      })
      .from(recipeNutritionCache)
      .where(
        and(
          inArray(recipeNutritionCache.recipeId, [...recipeIds]),
          eq(recipeNutritionCache.resolverVersion, nutritionResolverVersion()),
        ),
      );
    for (const row of rows) out.set(row.recipeId, fromCacheValues(row));
    return out;
  } catch {
    return out;
  }
}

/**
 * Delete a recipe's cached row. Call this **inside** the transaction that
 * rewrites the recipe, so the invalidation commits or rolls back with the edit.
 *
 * Takes any drizzle handle so it works with a transaction (`tx`) as well as the
 * global client — the transaction is the point.
 */
export async function invalidateNutritionCache(
  db: Pick<NutritionDb, 'delete'>,
  recipeId: string,
): Promise<void> {
  await db.delete(recipeNutritionCache).where(eq(recipeNutritionCache.recipeId, recipeId));
}

/**
 * Recompute a recipe's nutrition and store it. Returns the view that was
 * computed (whether or not it was stored), or `null` when the recipe could not
 * be read.
 *
 * Two guards keep a slow refresh from winning a race it should lose:
 *
 * - The insert selects from `recipes` with
 *   `date_trunc('milliseconds', r.updated_at) <= <observed>`, so a recipe that
 *   has been saved again since the computation started stores nothing. (The
 *   truncation is not cosmetic: `updated_at` is written by `now()` at
 *   microsecond precision but read back into a millisecond-precision JS `Date`,
 *   so an untruncated comparison would reject every write for a recipe that has
 *   never been edited.)
 * - The `ON CONFLICT` update refuses to overwrite a row whose `recipe_updated_at`
 *   is newer than the incoming one, so two refreshes landing out of order
 *   converge on the newer values rather than on the later write.
 *
 * Best-effort by contract: never throws. A refresh that fails leaves the recipe
 * uncached, which the read path handles by computing.
 */
export async function refreshNutritionCache(
  db: NutritionDb,
  recipeId: string,
): Promise<RecipeNutritionView | null> {
  try {
    const computed = await computeRecipeNutritionView(db, recipeId);
    if (!computed) return null;

    const values = toCacheValues(computed.view);
    if (!values) return computed.view;

    await db.execute(sql`
      INSERT INTO recipe_nutrition_cache (
        recipe_id, resolver_version, source, per_serving, confidence,
        sourced_lines, total_lines, unresolved_lines, recipe_updated_at
      )
      SELECT
        r.id,
        ${nutritionResolverVersion()},
        ${values.source},
        ${JSON.stringify(values.perServing)}::jsonb,
        ${values.confidence},
        ${values.sourcedLines},
        ${values.totalLines},
        ${values.unresolvedLines == null ? null : JSON.stringify(values.unresolvedLines)}::jsonb,
        ${computed.recipeUpdatedAt}
      FROM recipes r
      WHERE r.id = ${recipeId}
        AND date_trunc('milliseconds', r.updated_at) <= ${computed.recipeUpdatedAt}
      ON CONFLICT (recipe_id) DO UPDATE SET
        resolver_version = excluded.resolver_version,
        source = excluded.source,
        per_serving = excluded.per_serving,
        confidence = excluded.confidence,
        sourced_lines = excluded.sourced_lines,
        total_lines = excluded.total_lines,
        unresolved_lines = excluded.unresolved_lines,
        recipe_updated_at = excluded.recipe_updated_at,
        updated_at = now()
      WHERE excluded.recipe_updated_at >= recipe_nutrition_cache.recipe_updated_at
    `);

    return computed.view;
  } catch {
    return null;
  }
}
