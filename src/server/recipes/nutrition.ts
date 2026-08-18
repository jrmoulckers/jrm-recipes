import 'server-only';

import { db, isDbConfigured } from '~/server/db';
import type { Nutrition } from '~/lib/nutrition';
import { hasNutrition } from '~/lib/nutrition';
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
import { readCachedNutritionView, refreshNutritionCache } from './nutrition-cache';

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
