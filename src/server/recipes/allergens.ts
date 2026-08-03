import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { foodItems, recipeIngredients } from "~/server/db/schema";
import {
  ingredientAllergens,
  unionIngredientAllergens,
  type AllergenIngredientSource,
} from "~/lib/recipe-allergens";
import { type Allergen } from "~/lib/allergens";

/**
 * The STRUCTURED source of truth for a recipe's allergens (issue: attach
 * allergen data to the food graph). For each ingredient line it reads the
 * canonical allergen tokens off the resolved `food_items` node (via
 * `recipe_ingredients.foodId`), falling back to the free-text detector only for
 * lines that don't resolve to a food carrying curated allergen data. Then
 * unions per recipe.
 *
 * Best-effort and resilient: when the DB is off (or there are no ids) it returns
 * an empty map, and recipes with no ingredients map to `[]`. Callers that warn
 * (planner add, shopping build-from-plan) simply surface nothing rather than
 * asserting safety off an empty list.
 */
export async function getRecipeAllergensBatch(
  recipeIds: readonly string[],
): Promise<Map<string, Allergen[]>> {
  const result = new Map<string, Allergen[]>();
  const ids = [...new Set(recipeIds)];
  if (ids.length === 0 || !isDbConfigured()) return result;

  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      item: recipeIngredients.item,
      foodAllergens: foodItems.allergens,
    })
    .from(recipeIngredients)
    .leftJoin(foodItems, eq(recipeIngredients.foodId, foodItems.id))
    .where(inArray(recipeIngredients.recipeId, ids));

  const byRecipe = new Map<string, AllergenIngredientSource[]>();
  for (const row of rows) {
    const list = byRecipe.get(row.recipeId) ?? [];
    list.push({ item: row.item, foodAllergens: row.foodAllergens ?? null });
    byRecipe.set(row.recipeId, list);
  }

  for (const id of ids) {
    result.set(id, unionIngredientAllergens(byRecipe.get(id) ?? []));
  }
  return result;
}

/** The structured allergens for a single recipe (see {@link getRecipeAllergensBatch}). */
export async function getRecipeAllergens(
  recipeId: string,
): Promise<Allergen[]> {
  const map = await getRecipeAllergensBatch([recipeId]);
  return map.get(recipeId) ?? [];
}

/**
 * Per-ingredient structured allergens for one recipe, keyed by
 * `recipe_ingredients.id`. Powers the ingredient-level flags on the recipe
 * detail panel: each line resolves via `foodId → food_items.allergens`, falling
 * back to text detection when the line carries no curated food. Best-effort.
 * returns an empty map when the DB is off.
 */
export async function getRecipeIngredientAllergens(
  recipeId: string,
): Promise<Map<string, Allergen[]>> {
  const result = new Map<string, Allergen[]>();
  if (!isDbConfigured()) return result;

  const rows = await db
    .select({
      id: recipeIngredients.id,
      item: recipeIngredients.item,
      foodAllergens: foodItems.allergens,
    })
    .from(recipeIngredients)
    .leftJoin(foodItems, eq(recipeIngredients.foodId, foodItems.id))
    .where(eq(recipeIngredients.recipeId, recipeId));

  for (const row of rows) {
    const src: AllergenIngredientSource = {
      item: row.item,
      foodAllergens: row.foodAllergens ?? null,
    };
    result.set(row.id, ingredientAllergens(src));
  }
  return result;
}
