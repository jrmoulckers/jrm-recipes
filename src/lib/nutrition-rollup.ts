/**
 * Aggregate many recipes' nutrition into one total — a planned week, a filtered
 * cooking journal — together with an **honest** aggregate confidence (#1048,
 * ADR-0008).
 *
 * Pure and framework-free: it consumes {@link RecipeNutritionView} values that
 * the server already resolved through the one entry point, and never resolves
 * anything itself. Nothing here reads the food graph, the cache, or the
 * database; that is the whole reason the numbers a roll-up shows cannot drift
 * from the numbers the recipe page shows.
 */

import type { UnresolvedLine } from '~/lib/food-grams';
import { NUTRIENTS, type Nutrition } from '~/lib/nutrition';
import type { NutritionProvenance, RecipeNutritionView } from '~/lib/recipe-nutrition';

/** One meal's contribution to a roll-up. */
export type RollUpItem = {
  /** Stable key — the planner entry or cook-log entry id. */
  id: string;
  /** The recipe, for display: "Chicken pie". */
  title: string;
  /** Where this meal sits, for display: "Tuesday dinner", "12 March". */
  context: string;
  /**
   * Servings this meal contributes. A meal with no recorded serving count is
   * treated as **one** serving rather than skipped: the meal happened, and
   * dropping it would understate the total silently.
   */
  servings: number;
  /** The resolved view, straight from `getRecipeNutritionView(s)`. */
  view: RecipeNutritionView;
};

/** An ingredient line that contributed nothing, named *and* placed. */
export type RollUpUnresolved = UnresolvedLine & {
  /** The meal it belongs to: "Tuesday dinner · Chicken pie". */
  meal: string;
};

/** A meal that contributed no nutrition at all. */
export type RollUpMissingMeal = {
  id: string;
  /** "Tuesday dinner · Chicken pie". */
  meal: string;
};

/** How many meals came from each rung of the precedence ladder. */
export type RollUpSourceMix = Record<NutritionProvenance['source'], number>;

/** The aggregate answer for a set of meals. */
export type NutritionRollUp = {
  /** Summed nutrition across every meal. Absent nutrients stay absent. */
  total: Nutrition;
  /** Servings the total covers (counted meals only). */
  servings: number;
  /** Meals considered. */
  mealCount: number;
  /** Meals that contributed nutrition. */
  countedMeals: number;
  /**
   * 0–1 confidence in the total. See {@link aggregateRollUpConfidence} — it is a
   * ratio of captured food to implied true food, not an average of averages.
   */
  confidence: number;
  /** Meals that contributed nothing, named so the cook knows which. */
  missingMeals: RollUpMissingMeal[];
  /** Lines that could not be weighed or had no facts, with their meal. */
  unresolved: RollUpUnresolved[];
  /** Provenance mix, so the card can say "4 entered, 9 estimated". */
  sources: RollUpSourceMix;
};

/** The honest "nothing to show" roll-up. */
export function emptyNutritionRollUp(): NutritionRollUp {
  return {
    total: {},
    servings: 0,
    mealCount: 0,
    countedMeals: 0,
    confidence: 0,
    missingMeals: [],
    unresolved: [],
    sources: { manual: 0, graph: 0, estimate: 0, none: 0 },
  };
}

/**
 * A meal's confidence.
 *
 * `manual` is 1: the cook's own numbers are not an estimate, so there is nothing
 * to be partially confident about. `none` is 0 — and, crucially, still counted,
 * which is what stops a week of unresolvable meals from reporting the confidence
 * of the two meals that happened to resolve.
 */
export function mealConfidence(provenance: NutritionProvenance): number {
  switch (provenance.source) {
    case 'manual':
      return 1;
    case 'graph':
    case 'estimate':
      return clamp01(provenance.confidence);
    case 'none':
      return 0;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** A meal reduced to the two numbers the aggregate needs. */
export type RollUpConfidenceEntry = {
  /**
   * The energy this meal *claims* to contribute (kcal × servings), or `null`
   * when the meal reports no calories at all. Never coerced to 0 — unknown and
   * zero are different claims.
   */
  energy: number | null;
  /** The meal's own 0–1 confidence. */
  confidence: number;
};

/**
 * Combine per-meal confidences into one 0–1 score for a whole week or journal
 * (#1048), the level-up of {@link aggregateConfidence} in `food-grams.ts`.
 *
 * ## Why not the obvious two
 *
 * A **plain average** hides distribution: nine exact recipes and one recipe with
 * three unweighed ingredients reads as a comfortable `0.96`, and it says the
 * same thing whether the unreliable meal is a garnish or the Sunday roast.
 *
 * A **calorie-weighted average** looks like the fix and is in fact worse, for
 * precisely the reason `massCoverage` was worse than nothing: *a low-confidence
 * meal's calories are themselves understated*. A recipe that could weigh 10% of
 * its food reports about 10% of its calories, so weighting by reported calories
 * weights the meal we know least about at almost nothing. The food we failed to
 * measure leaves the denominator again, one level up:
 * `(4500×1.0 + 50×0.1) / 4550 = 0.999`.
 *
 * ## What this does instead
 *
 * Treat the score as a **ratio of real quantities** rather than as a mean. A
 * meal reporting `E` calories at confidence `c` is implicitly claiming to have
 * captured a `c` fraction of its own food, so the food that was actually there
 * is about `E / c`. Then:
 *
 * ```text
 * confidence = Σ E_i  /  Σ (E_i / c_i)
 * ```
 *
 * — captured food over implied true food. (Formally the energy-weighted
 * *harmonic* mean of the per-meal confidences.) The missing food is put back
 * into the denominator instead of vanishing from it, which is the same
 * correction #1027 made for lines, applied to meals. On the example above it
 * returns `0.91`, not `0.999`; and a small unreliable side dish still moves it
 * only slightly, because it genuinely is only a little of the week's food.
 *
 * ## Meals with no energy to weight
 *
 * A meal that resolved to nothing has no calories at all — that is exactly what
 * failed — and inventing an energy for it would repeat the error being fixed. As
 * in `aggregateConfidence`, such meals dilute the score by their share of the
 * **meal count**: multiply by `counted / total`. The same treatment covers a
 * meal whose nutrition carries no calories key.
 *
 * Returns 0 for an empty list or when nothing could be counted. Pure; never
 * throws.
 */
export function aggregateRollUpConfidence(entries: readonly RollUpConfidenceEntry[]): number {
  if (entries.length === 0) return 0;

  let claimed = 0;
  let implied = 0;
  let counted = 0;
  let confidenceSum = 0;

  for (const entry of entries) {
    const c = clamp01(entry.confidence);
    if (c <= 0) continue;

    const energy = entry.energy;
    if (energy == null || !Number.isFinite(energy) || energy < 0) continue;

    counted += 1;
    confidenceSum += c;
    claimed += energy;
    implied += energy / c;
  }

  if (counted === 0) return 0;

  // Zero total energy (every counted meal reports 0 kcal) leaves the ratio
  // undefined, so fall back to the unweighted mean — the same fallback
  // `aggregateConfidence` uses when every weighable line resolves to 0 g.
  const countedConfidence = implied > 0 ? claimed / implied : confidenceSum / counted;
  return clamp01(countedConfidence * (counted / entries.length));
}

/** Add `nutrition × factor` into `acc`, leaving absent nutrients absent. */
function accumulate(acc: Nutrition, nutrition: Nutrition, factor: number): void {
  if (!Number.isFinite(factor)) return;
  for (const { key } of NUTRIENTS) {
    const value = nutrition[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    acc[key] = (acc[key] ?? 0) + value * factor;
  }
}

/** A serving count that can be multiplied by. Anything unusable becomes 1. */
function safeServings(servings: number): number {
  if (!Number.isFinite(servings) || servings <= 0) return 1;
  return servings;
}

/** "Tuesday dinner · Chicken pie", or just whichever half exists. */
function mealLabel(item: RollUpItem): string {
  return [item.context, item.title]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * Roll a set of meals up into one total plus the honesty numbers that make the
 * total readable: how many meals are behind it, which contributed nothing, which
 * ingredient lines could not be weighed and where, and an aggregate confidence
 * from {@link aggregateRollUpConfidence}.
 *
 * Order-independent and pure. A meal whose view is `none` still counts toward
 * `mealCount` and toward the confidence denominator, so a total can never quietly
 * be the sum of the only three meals that happened to resolve.
 */
export function rollUpNutritionViews(items: readonly RollUpItem[]): NutritionRollUp {
  const rollUp = emptyNutritionRollUp();
  if (items.length === 0) return rollUp;

  const total: Nutrition = {};
  const entries: RollUpConfidenceEntry[] = [];

  for (const item of items) {
    rollUp.mealCount += 1;
    rollUp.sources[item.view.provenance.source] += 1;

    const servings = safeServings(item.servings);
    const confidence = mealConfidence(item.view.provenance);
    const label = mealLabel(item);

    if (item.view.provenance.source === 'none') {
      entries.push({ energy: null, confidence: 0 });
      rollUp.missingMeals.push({ id: item.id, meal: label });
      continue;
    }

    rollUp.countedMeals += 1;
    rollUp.servings += servings;
    accumulate(total, item.view.perServing, servings);

    const calories = item.view.perServing.calories;
    entries.push({
      energy:
        typeof calories === 'number' && Number.isFinite(calories) ? calories * servings : null,
      confidence,
    });

    const provenance = item.view.provenance;
    if (provenance.source !== 'manual') {
      for (const line of provenance.unresolvedLines) {
        if (!line.label.trim()) continue;
        rollUp.unresolved.push({ label: line.label, reason: line.reason, meal: label });
      }
    }
  }

  rollUp.total = total;
  rollUp.confidence = aggregateRollUpConfidence(entries);
  return rollUp;
}

/** Whether a roll-up has anything worth rendering. */
export function hasRollUp(rollUp: NutritionRollUp): boolean {
  return rollUp.countedMeals > 0;
}

/** The roll-up divided by `parts` (e.g. a week's total per day). */
export function averageRollUp(total: Nutrition, parts: number): Nutrition {
  const divisor = Number.isFinite(parts) && parts > 0 ? parts : 1;
  const out: Nutrition = {};
  accumulate(out, total, 1 / divisor);
  return out;
}
