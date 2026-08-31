import 'server-only';

import {
  emptyNutritionRollUp,
  rollUpNutritionViews,
  type NutritionRollUp,
} from '~/lib/nutrition-rollup';
import {
  buildNutritionAdherence,
  type DatedRollUpItem,
  type MemberNutritionAdherence,
  type NutritionAdherenceMember,
} from '~/lib/nutrition-adherence';
import { emptyNutritionView } from '~/lib/recipe-nutrition';
import { getNutritionTargetsOn } from '~/server/dietary/targets';

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
  /** `YYYY-MM-DD`, used to select the historical target in force. */
  date: string;
};

function toRollUpItems(
  meals: readonly RollUpMeal[],
  views: Awaited<ReturnType<typeof getRecipeNutritionViews>>,
): DatedRollUpItem[] {
  return meals.map((meal) => ({
    id: meal.id,
    title: meal.title,
    context: meal.context,
    servings: meal.servings,
    date: meal.date,
    view: (meal.recipeId ? views.get(meal.recipeId) : null) ?? emptyNutritionView(),
  }));
}

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
  return rollUpNutritionViews(toRollUpItems(meals, views));
}

export type NutritionRollUpWithTargets = {
  rollUp: NutritionRollUp;
  adherence: MemberNutritionAdherence[];
};

/**
 * Resolve one displayed meal set and its historical target matrix in two
 * batched reads, then do all per-member/per-regime scoring in memory.
 */
export async function rollUpMealNutritionWithTargets({
  meals,
  periodDates,
  members,
  userId,
}: {
  meals: readonly RollUpMeal[];
  periodDates: readonly string[];
  members: readonly NutritionAdherenceMember[];
  userId: string;
}): Promise<NutritionRollUpWithTargets> {
  if (meals.length === 0) {
    return { rollUp: emptyNutritionRollUp(), adherence: [] };
  }

  const recipeIds = meals
    .map((meal) => meal.recipeId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const dates = [...new Set([...periodDates, ...meals.map((meal) => meal.date)])];

  const [views, targetsByProfileAndDate] = await Promise.all([
    getRecipeNutritionViews(recipeIds),
    getNutritionTargetsOn(
      members.map((member) => member.id),
      dates,
      { userId },
    ),
  ]);
  const items = toRollUpItems(meals, views);

  return {
    rollUp: rollUpNutritionViews(items),
    adherence: buildNutritionAdherence(items, dates, members, targetsByProfileAndDate),
  };
}
