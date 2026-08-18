import 'server-only';

import {
  emptyNutritionRollUp,
  rollUpNutritionViews,
  type NutritionRollUp,
  type RollUpItem,
} from '~/lib/nutrition-rollup';
import { emptyNutritionView } from '~/lib/recipe-nutrition';

import { getRecipeNutritionViews } from './nutrition';

/**
 * Meal-shaped roll-up input, the bridge between a surface's own rows (planner
 * entries, cook-log entries) and the pure aggregation in
 * `~/lib/nutrition-rollup` (#1048).
 */
export type RollUpMeal = {
  /** Stable key — the planner or cook-log entry id. */
  id: string;
  /** The recipe cooked, or `null` for a free-text slot ("leftovers", "eat out"). */
  recipeId: string | null;
  /** Recipe title, or whatever the surface wants to call this meal. */
  title: string;
  /** Where the meal sits: "Tuesday dinner", "12 March". */
  context: string;
  /** Servings this meal accounts for. Unrecorded counts as one. */
  servings: number;
};

/**
 * Resolve every meal's nutrition through the one entry point and aggregate it.
 *
 * Reads are batched by {@link getRecipeNutritionViews}, so a week of meals costs
 * a couple of queries rather than one per meal — and every figure still comes
 * from the same precedence ladder the recipe page uses, because it is literally
 * the same resolution path.
 *
 * A meal with no recipe, or whose recipe resolves to nothing, is kept as a
 * *missing* meal rather than dropped. Dropping it would let a week of takeaway
 * notes and one carefully-linked dinner report the dinner's confidence, which is
 * the same denominator leak #1027 fixed for ingredient lines.
 */
export async function rollUpMealNutrition(meals: readonly RollUpMeal[]): Promise<NutritionRollUp> {
  if (meals.length === 0) return emptyNutritionRollUp();

  const recipeIds = meals
    .map((meal) => meal.recipeId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const views = await getRecipeNutritionViews(recipeIds);

  const items: RollUpItem[] = meals.map((meal) => ({
    id: meal.id,
    title: meal.title,
    context: meal.context,
    servings: meal.servings,
    view: (meal.recipeId ? views.get(meal.recipeId) : null) ?? emptyNutritionView(),
  }));

  return rollUpNutritionViews(items);
}
