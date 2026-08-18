import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type * as schema from '~/server/db/schema';
import { recipes, recipeIngredients } from '~/server/db/schema/recipes';
import { foodItems, foodNutrients, foodNutrition } from '~/server/db/schema/ingredients';
import type { NutritionFacts, NutritionIngredient } from '~/lib/food-nutrition';
import { hasNutrients, vectorFromRows } from '~/lib/nutrients';
import type { Nutrition } from '~/lib/nutrition';
import { hasNutrition } from '~/lib/nutrition';
import {
  emptyNutritionView,
  resolveNutritionView,
  rollUpNutrition,
  type RecipeNutritionEstimate,
  type RecipeNutritionView,
  type ResolvedNutritionLine,
} from '~/lib/recipe-nutrition';

/**
 * The nutrition computation, over an **injected** database handle (issue #1044).
 *
 * `nutrition.ts` is `server-only` and reads the app's global `db`, which is the
 * right shape for a request but the wrong shape for a script: the backfill runs
 * outside Next, against a direct (non-pooled) connection it opens itself. Rather
 * than let the script reimplement the query — which would let the cached numbers
 * drift from the served ones, the precise failure #1029 was about — the query
 * lives here once and takes its client as a parameter.
 */
export type NutritionDb = PostgresJsDatabase<typeof schema>;

/**
 * Everything a nutrition answer needs for one recipe, read in one pass: the
 * serving count, the raw lines (for the free-text fallback), the same lines
 * resolved against the live food graph (for the authoritative roll-up), and the
 * recipe's `updatedAt` at the moment it was read.
 *
 * `updatedAt` is carried so a cache write can be made conditional on the recipe
 * not having changed underneath a slow computation.
 */
export type RecipeNutritionInputs = {
  servings: number;
  textLines: NutritionIngredient[];
  resolved: ResolvedNutritionLine[];
  updatedAt: Date;
};

/**
 * Load and graph-resolve a recipe's ingredient lines. Returns `null` when the
 * recipe is missing or the read fails. Never throws: nutrition is an overlay and
 * must not break the recipe page.
 */
export async function loadRecipeNutritionInputs(
  db: NutritionDb,
  recipeId: string,
): Promise<RecipeNutritionInputs | null> {
  try {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
      columns: { servings: true, updatedAt: true },
      with: {
        ingredients: {
          orderBy: [recipeIngredients.position],
          columns: { quantity: true, unit: true, item: true, foodId: true },
        },
      },
    });
    if (!recipe) return null;

    const servings = recipe.servings ?? 1;
    const updatedAt = recipe.updatedAt;
    const lines = recipe.ingredients.filter((i) => i.item?.trim());
    if (lines.length === 0) return { servings, textLines: [], resolved: [], updatedAt };

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
      updatedAt,
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

/** The graph roll-up for a recipe, or `null` when its inputs can't be read. */
export function rollUpInputs(inputs: RecipeNutritionInputs): RecipeNutritionEstimate {
  return rollUpNutrition(inputs.resolved, inputs.servings);
}

/**
 * Compute a recipe's nutrition view from scratch, together with the
 * `recipes.updated_at` the answer was derived from.
 *
 * The timestamp is what lets a cache write be conditional: a refresh that took
 * long enough for a newer save to land must not overwrite the newer values with
 * its own. Returns `null` for a recipe that could not be read at all, which the
 * caller distinguishes from a recipe that legitimately resolves to nothing.
 */
export async function computeRecipeNutritionView(
  db: NutritionDb,
  recipeId: string,
  manual?: Nutrition | null,
): Promise<{ view: RecipeNutritionView; recipeUpdatedAt: Date } | null> {
  const inputs = await loadRecipeNutritionInputs(db, recipeId);
  if (!inputs) return null;

  if (manual && hasNutrition(manual)) {
    return { view: resolveNutritionView({ manual }), recipeUpdatedAt: inputs.updatedAt };
  }

  return {
    view: resolveNutritionView({
      graph: rollUpInputs(inputs),
      ingredients: inputs.textLines,
      servings: inputs.servings,
    }),
    recipeUpdatedAt: inputs.updatedAt,
  };
}

/** Re-export so callers of this module need only one import. */
export { emptyNutritionView };
