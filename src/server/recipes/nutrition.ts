import 'server-only';

import { eq, inArray } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { recipes, recipeIngredients } from '~/server/db/schema/recipes';
import { foodItems, foodNutrition } from '~/server/db/schema/ingredients';
import type { NutritionFacts } from '~/lib/food-nutrition';
import {
  emptyRecipeNutrition,
  rollUpNutrition,
  type RecipeNutritionEstimate,
  type ResolvedNutritionLine,
} from '~/lib/recipe-nutrition';

/**
 * Auto-estimate a recipe's **per-serving** nutrition from its ingredient list,
 * resolved against the live food graph (Phase 4, `docs/food-graph.md` §8).
 *
 * Unlike the client-side text-match estimate in `food-nutrition.ts`, this reads
 * each ingredient line's `foodId`. The write-time link to a canonical
 * {@link foodItems} node and looks up that node's authoritative per-100 g
 * {@link foodNutrition} facts and `densityGPerMl`, then rolls the lines up with
 * the pure {@link rollUpNutrition}. Grams come from the unit: weight units
 * directly, volume units via density, count/unknown units skipped. The result
 * carries coverage numbers so a partial estimate is shown honestly.
 *
 * Compute-on-read by design: no nutrition is cached or persisted here. Never
 * throws. A missing recipe, an unconfigured/erroring database, or a recipe with
 * no resolvable ingredients all yield an empty estimate the UI renders as
 * nothing.
 */
export async function computeRecipeNutrition(recipeId: string): Promise<RecipeNutritionEstimate> {
  if (!isDbConfigured()) return emptyRecipeNutrition();

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
    if (!recipe) return emptyRecipeNutrition();

    const servings = recipe.servings ?? 1;
    const lines = recipe.ingredients.filter((i) => i.item?.trim());
    if (lines.length === 0) return emptyRecipeNutrition(servings);

    // Batch-load the graph facts for every linked food in one round-trip each,
    // keyed by foodId, so the roll-up itself stays a pure in-memory pass.
    const foodIds = [
      ...new Set(lines.map((l) => l.foodId).filter((id): id is string => id != null)),
    ];

    const [densityRows, nutritionRows] =
      foodIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({
                id: foodItems.id,
                slug: foodItems.slug,
                densityGPerMl: foodItems.densityGPerMl,
              })
              .from(foodItems)
              .where(inArray(foodItems.id, foodIds)),
            db
              .select({
                foodId: foodNutrition.foodId,
                kcal: foodNutrition.kcal,
                proteinG: foodNutrition.proteinG,
                carbsG: foodNutrition.carbsG,
                fatG: foodNutrition.fatG,
                fiberG: foodNutrition.fiberG,
                sugarG: foodNutrition.sugarG,
                sodiumMg: foodNutrition.sodiumMg,
                sourceRef: foodNutrition.sourceRef,
              })
              .from(foodNutrition)
              .where(inArray(foodNutrition.foodId, foodIds)),
          ]);

    const densityById = new Map<string, number | null>(
      densityRows.map((r) => [r.id, r.densityGPerMl]),
    );
    const slugById = new Map<string, string>(densityRows.map((r) => [r.id, r.slug]));
    const factsById = new Map<string, NutritionFacts>(
      nutritionRows.map((r) => [
        r.foodId,
        {
          kcal: r.kcal,
          proteinG: r.proteinG,
          carbsG: r.carbsG,
          fatG: r.fatG,
          fiberG: r.fiberG ?? undefined,
          sugarG: r.sugarG ?? undefined,
          sodiumMg: r.sodiumMg ?? undefined,
          sourceRef: r.sourceRef,
        },
      ]),
    );

    const resolved: ResolvedNutritionLine[] = lines.map((l) => ({
      quantity: l.quantity,
      unit: l.unit,
      facts: l.foodId ? (factsById.get(l.foodId) ?? null) : null,
      densityGPerMl: l.foodId ? (densityById.get(l.foodId) ?? null) : null,
      slug: l.foodId ? (slugById.get(l.foodId) ?? null) : null,
    }));

    return rollUpNutrition(resolved, servings);
  } catch {
    // Nutrition is a nice-to-have overlay. Never let an estimate failure break
    // the recipe page. Fall back to the honest "nothing to show" shape.
    return emptyRecipeNutrition();
  }
}
