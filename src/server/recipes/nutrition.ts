import 'server-only';

import { inArray } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { recipes } from '~/server/db/schema/recipes';
import type { NutritionKey } from '~/lib/nutrients';
import type { Nutrition } from '~/lib/nutrition';
import { hasNutrition, NUTRIENTS, pickNutrition } from '~/lib/nutrition';
import {
  emptyNutritionView,
  emptyRecipeNutrition,
  resolveNutritionView,
  type RecipeNutritionEstimate,
  type RecipeNutritionView,
} from '~/lib/recipe-nutrition';

import {
  computeRecipeNutritionView,
  loadRecipeNutritionInputs,
  rollUpInputs,
} from './nutrition-compute';
import {
  readCachedNutritionView,
  readCachedNutritionViews,
  refreshNutritionCache,
} from './nutrition-cache';

/**
 * The recipe columns holding the cook's own per-serving numbers, projected from
 * the nutrient registry rather than re-spelled (#1028). A nutrient added to the
 * registry without a matching `recipes` column fails the type-check here, which
 * is the signal we want; a hand-written list would just quietly omit it.
 */
const MANUAL_NUTRITION_COLUMNS = Object.fromEntries(
  NUTRIENTS.map((nutrient) => [nutrient.key, true]),
) as { [K in NutritionKey]: true };

/**
 * **The** entry point for "what is this recipe's nutrition?" (#1029).
 *
 * Applies the one precedence ladder — the cook's own numbers, then the
 * food-graph estimate, then the free-text estimate — and returns the answer
 * tagged with its `NutritionProvenance`, so every consumer receives the
 * provenance as a value instead of re-deriving it. Before this existed the
 * ladder lived in a `useMemo` inside `ingredients-panel.tsx`, which meant the
 * server literally could not reproduce what the UI showed, and search
 * disagreeing with the recipe page was a matter of time.
 *
 * `manual` is the cook's stored per-serving nutrition. When it is present and
 * non-empty no database read happens at all — which is also why a manual answer
 * is never cached.
 *
 * Otherwise the derived cache is consulted first (#1044), and a row stamped with
 * a different resolver version is treated as a miss. **A miss computes and
 * returns without writing**: population happens after a recipe save and in the
 * backfill, never in a request path where many readers could race for the same
 * recipe. See `nutrition-cache.ts` for the full write strategy.
 *
 * Never throws — an unconfigured database, a missing recipe, or a recipe with no
 * resolvable ingredients all yield `{ source: 'none' }`, which the UI renders as
 * nothing.
 */
export async function getRecipeNutritionView(
  recipeId: string,
  manual?: Nutrition | null,
): Promise<RecipeNutritionView> {
  if (manual && hasNutrition(manual)) return resolveNutritionView({ manual });
  if (!isDbConfigured()) return emptyNutritionView();

  const cached = await readCachedNutritionView(db, recipeId);
  if (cached) return cached;

  const computed = await computeRecipeNutritionView(db, recipeId);
  return computed?.view ?? emptyNutritionView();
}

/**
 * The **batch** sibling of {@link getRecipeNutritionView} (#1048): the same
 * answer for many recipes at once, keyed by recipe id.
 *
 * Deliberately a sibling rather than a fork. It applies the identical precedence
 * ladder by delegating to the identical pieces — the cook's stored numbers via
 * `resolveNutritionView`, then `readCachedNutritionViews`, then
 * `computeRecipeNutritionView` — so a week's roll-up cannot disagree with the
 * recipe pages it is summing. What changes is only the shape of the reads:
 *
 * 1. **One** query for the manual per-serving numbers across every id.
 * 2. **One** query for the cached rows.
 * 3. Misses computed individually, since a miss is genuinely per-recipe work.
 *
 * A miss loop is bounded in practice (the cache is populated after every save
 * and by the backfill), and it never *writes*, for the same reason the single
 * read never does: a request path that populates the cache is a request path
 * that races itself.
 *
 * Never throws. Ids that cannot be resolved at all are simply absent from the
 * map, which callers render as "no nutrition for this meal" rather than as zero.
 */
export async function getRecipeNutritionViews(
  recipeIds: readonly string[],
): Promise<Map<string, RecipeNutritionView>> {
  const out = new Map<string, RecipeNutritionView>();
  const ids = [...new Set(recipeIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0 || !isDbConfigured()) return out;

  let pending = ids;

  try {
    const manualRows = await db.query.recipes.findMany({
      where: inArray(recipes.id, pending),
      columns: { id: true, ...MANUAL_NUTRITION_COLUMNS },
    });

    const stillPending: string[] = [];
    const manualById = new Map(manualRows.map((row) => [row.id, pickNutrition(row)]));
    for (const id of pending) {
      const manual = manualById.get(id);
      if (manual && hasNutrition(manual)) out.set(id, resolveNutritionView({ manual }));
      else stillPending.push(id);
    }
    pending = stillPending;
  } catch {
    // A failed manual read is not fatal: every id simply falls through to the
    // derived path, which is where a recipe without stored numbers goes anyway.
  }

  const cached = await readCachedNutritionViews(db, pending);
  const misses: string[] = [];
  for (const id of pending) {
    const hit = cached.get(id);
    if (hit) out.set(id, hit);
    else misses.push(id);
  }

  for (const id of misses) {
    const computed = await computeRecipeNutritionView(db, id);
    if (computed) out.set(id, computed.view);
  }

  return out;
}

/**
 * Recompute and store a recipe's cached nutrition. Call **after** the write
 * transaction that changed the recipe has committed; the matching invalidation
 * belongs inside it (`invalidateNutritionCache`).
 *
 * Best-effort and non-throwing: a failure leaves the recipe uncached, and the
 * next read simply computes.
 */
export async function refreshRecipeNutritionCache(recipeId: string): Promise<void> {
  if (!isDbConfigured()) return;
  await refreshNutritionCache(db, recipeId);
}

/**
 * Auto-estimate a recipe's **per-serving** nutrition from its ingredient list,
 * resolved against the live food graph (Phase 4, `docs/food-graph.md` §8).
 *
 * This is the *graph rung* of the ladder, exposed for callers that specifically
 * want the graph roll-up and its coverage numbers. Anything asking the broader
 * question "what nutrition should I show for this recipe?" must go through
 * {@link getRecipeNutritionView} instead, so it gets the same precedence,
 * provenance, and cache as every other surface.
 *
 * Unlike the text-match estimate in `food-nutrition.ts`, this reads each
 * ingredient line's `foodId` — the write-time link to a canonical food node —
 * and looks up that node's authoritative per-100 g facts and `densityGPerMl`,
 * then rolls the lines up with the pure `rollUpNutrition`. Grams come from the
 * shared `food-grams.ts` resolver, so counted measures resolve through curated
 * portions. The result carries a confidence score and the lines that resolved to
 * nothing, so a partial estimate is shown honestly.
 *
 * Deliberately **not** cached: the cache stores the one answer
 * ({@link getRecipeNutritionView}), not every intermediate shape. Never throws.
 */
export async function computeRecipeNutrition(recipeId: string): Promise<RecipeNutritionEstimate> {
  if (!isDbConfigured()) return emptyRecipeNutrition();
  const inputs = await loadRecipeNutritionInputs(db, recipeId);
  if (!inputs) return emptyRecipeNutrition();
  if (inputs.resolved.length === 0) return emptyRecipeNutrition(inputs.servings);
  return rollUpInputs(inputs);
}
