import 'server-only';

import { eq, inArray } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { recipes, recipeIngredients } from '~/server/db/schema/recipes';
import { foodItems, foodNutrients, foodNutrition } from '~/server/db/schema/ingredients';
import type { NutritionFacts, NutritionIngredient } from '~/lib/food-nutrition';
import { hasNutrients, vectorFromRows } from '~/lib/nutrients';
import type { Nutrition } from '~/lib/nutrition';
import { hasNutrition } from '~/lib/nutrition';
import {
  emptyNutritionView,
  emptyRecipeNutrition,
  resolveNutritionView,
  rollUpNutrition,
  type RecipeNutritionEstimate,
  type RecipeNutritionView,
  type ResolvedNutritionLine,
} from '~/lib/recipe-nutrition';

/**
 * Everything a nutrition answer needs for one recipe, read in one pass: the
 * serving count, the raw lines (for the free-text fallback), and the same lines
 * resolved against the live food graph (for the authoritative roll-up).
 */
type RecipeNutritionInputs = {
  servings: number;
  textLines: NutritionIngredient[];
  resolved: ResolvedNutritionLine[];
};

/**
 * Load and graph-resolve a recipe's ingredient lines. Returns `null` when the
 * recipe is missing, the database is unavailable, or there is nothing to weigh.
 * Never throws: nutrition is an overlay and must not break the recipe page.
 */
async function loadRecipeNutritionInputs(recipeId: string): Promise<RecipeNutritionInputs | null> {
  if (!isDbConfigured()) return null;

  try {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
      columns: { servings: true },
      with: {
        ingredients: {
          orderBy: [recipeIngredients.position],
          columns: { quantity: true, unit: true, item: true, foodId: true },
        },
      },
    });
    if (!recipe) return null;

    const servings = recipe.servings ?? 1;
    const lines = recipe.ingredients.filter((i) => i.item?.trim());
    if (lines.length === 0) return { servings, textLines: [], resolved: [] };

    // Batch-load the graph facts for every linked food in one round-trip each,
    // keyed by foodId, so the roll-up itself stays a pure in-memory pass.
    const foodIds = [
      ...new Set(lines.map((l) => l.foodId).filter((id): id is string => id != null)),
    ];

    const [densityRows, vectorRows, provenanceRows] =
      foodIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            db
              .select({
                id: foodItems.id,
                slug: foodItems.slug,
                densityGPerMl: foodItems.densityGPerMl,
              })
              .from(foodItems)
              .where(inArray(foodItems.id, foodIds)),
            // The nutrient vector (#1028): rows, not columns, so a nutrient
            // added to the registry reaches the roll-up without touching this
            // query.
            db
              .select({
                foodId: foodNutrients.foodId,
                nutrientId: foodNutrients.nutrientId,
                per100g: foodNutrients.per100g,
              })
              .from(foodNutrients)
              .where(inArray(foodNutrients.foodId, foodIds)),
            db
              .select({ foodId: foodNutrition.foodId, sourceRef: foodNutrition.sourceRef })
              .from(foodNutrition)
              .where(inArray(foodNutrition.foodId, foodIds)),
          ]);

    const densityById = new Map<string, number | null>(
      densityRows.map((r) => [r.id, r.densityGPerMl]),
    );
    const slugById = new Map<string, string>(densityRows.map((r) => [r.id, r.slug]));
    const sourceRefById = new Map<string, string>(
      provenanceRows.map((r) => [r.foodId, r.sourceRef]),
    );
    const rowsByFood = new Map<string, { nutrientId: string; per100g: number }[]>();
    for (const row of vectorRows) {
      const bucket = rowsByFood.get(row.foodId);
      if (bucket) bucket.push(row);
      else rowsByFood.set(row.foodId, [row]);
    }
    const factsById = new Map<string, NutritionFacts>();
    for (const [foodId, rows] of rowsByFood) {
      const vector = vectorFromRows(rows);
      if (!hasNutrients(vector)) continue;
      factsById.set(foodId, { ...vector, sourceRef: sourceRefById.get(foodId) ?? '' });
    }

    return {
      servings,
      textLines: lines.map((l) => ({ item: l.item, quantity: l.quantity, unit: l.unit })),
      resolved: lines.map((l) => ({
        quantity: l.quantity,
        unit: l.unit,
        facts: l.foodId ? (factsById.get(l.foodId) ?? null) : null,
        densityGPerMl: l.foodId ? (densityById.get(l.foodId) ?? null) : null,
        slug: l.foodId ? (slugById.get(l.foodId) ?? null) : null,
        // Carried so a line that resolves to nothing can be named rather than
        // only counted (#1027).
        label: l.item,
      })),
    };
  } catch {
    // Nutrition is a nice-to-have overlay. Never let an estimate failure break
    // the recipe page.
    return null;
  }
}

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
 * non-empty no database read happens at all.
 *
 * Compute-on-read by design: nothing is cached or persisted. Never throws — an
 * unconfigured database, a missing recipe, or a recipe with no resolvable
 * ingredients all yield `{ source: 'none' }`, which the UI renders as nothing.
 */
export async function getRecipeNutritionView(
  recipeId: string,
  manual?: Nutrition | null,
): Promise<RecipeNutritionView> {
  if (manual && hasNutrition(manual)) return resolveNutritionView({ manual });

  const inputs = await loadRecipeNutritionInputs(recipeId);
  if (!inputs) return emptyNutritionView();

  return resolveNutritionView({
    graph: rollUpNutrition(inputs.resolved, inputs.servings),
    ingredients: inputs.textLines,
    servings: inputs.servings,
  });
}

/**
 * Auto-estimate a recipe's **per-serving** nutrition from its ingredient list,
 * resolved against the live food graph (Phase 4, `docs/food-graph.md` §8).
 *
 * This is the *graph rung* of the ladder, exposed for callers that specifically
 * want the graph roll-up and its coverage numbers. Anything asking the broader
 * question "what nutrition should I show for this recipe?" must go through
 * {@link getRecipeNutritionView} instead, so it gets the same precedence and
 * provenance as every other surface.
 *
 * Unlike the text-match estimate in `food-nutrition.ts`, this reads each
 * ingredient line's `foodId` — the write-time link to a canonical
 * {@link foodItems} node — and looks up that node's authoritative per-100 g
 * {@link foodNutrition} facts and `densityGPerMl`, then rolls the lines up with
 * the pure {@link rollUpNutrition}. Grams come from the shared `food-grams.ts`
 * resolver, so counted measures resolve through curated portions. The result
 * carries a confidence score and the lines that resolved to nothing, so a
 * partial estimate is shown honestly.
 *
 * Compute-on-read by design: no nutrition is cached or persisted here. Never
 * throws.
 */
export async function computeRecipeNutrition(recipeId: string): Promise<RecipeNutritionEstimate> {
  const inputs = await loadRecipeNutritionInputs(recipeId);
  if (!inputs) return emptyRecipeNutrition();
  if (inputs.resolved.length === 0) return emptyRecipeNutrition(inputs.servings);
  return rollUpNutrition(inputs.resolved, inputs.servings);
}
