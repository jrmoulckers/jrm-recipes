/**
 * Ingredient → nutrition roll-up (Phase 4 hub-wiring, `docs/food-graph.md` §8).
 *
 * Where {@link estimateRecipeNutrition} in `food-nutrition.ts` resolves facts by
 * *text* against the static curated dataset, this module rolls up nutrition from
 * lines that have *already* been resolved against the live food graph — each
 * carries the canonical food's per-100 g {@link NutritionFacts} and its
 * `densityGPerMl`, looked up server-side via the `recipe_ingredients.foodId` FK.
 * That makes the recipe-detail estimate authoritative rather than best-guess.
 *
 * Everything here is pure and framework-free (it only borrows the unit maths in
 * `units.ts`), so the gram-conversion, summation, coverage, and servings-scaling
 * are exhaustively unit-testable and never touch the database. Nothing throws:
 * an unweighable or unresolved line is simply skipped and reflected honestly in
 * the coverage numbers.
 */

import { convertUnit, unitDimension } from "~/lib/units";
import type { NutritionFacts } from "~/lib/food-nutrition";
import type { Nutrition } from "~/lib/nutrition";

/**
 * One ingredient line ready for the roll-up. `facts` and `densityGPerMl` come
 * from the canonical food the line's `foodId` resolves to; both are optional
 * because the link is best-effort — a `null`/absent value just means that piece
 * of information is unknown for this line.
 */
export type ResolvedNutritionLine = {
  quantity?: number | null;
  unit?: string | null;
  /** Per-100 g facts for the line's food, or null when unlinked/uncurated. */
  facts?: NutritionFacts | null;
  /** g/mL for the line's food, or null when count-measured / unknown. */
  densityGPerMl?: number | null;
};

/**
 * Resolve the grams of a single ingredient line. Mass units convert straight to
 * grams; volume units need a positive `densityGPerMl` (g/mL) and return `null`
 * without one; count/temperature/unknown units return `null` because their
 * weight isn't knowable from the token alone. A missing or non-finite/negative
 * quantity is `null`. Never throws.
 */
export function resolveLineGrams(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  densityGPerMl: number | null | undefined,
): number | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) {
    return null;
  }
  const dimension = unitDimension(unit);
  if (dimension === "mass") {
    return convertUnit(quantity, unit!, "g");
  }
  if (dimension === "volume") {
    if (
      densityGPerMl == null ||
      !Number.isFinite(densityGPerMl) ||
      densityGPerMl <= 0
    ) {
      return null;
    }
    const ml = convertUnit(quantity, unit!, "ml");
    return ml == null ? null : ml * densityGPerMl;
  }
  return null;
}

/**
 * A recipe nutrition estimate rolled up from its ingredient lines. `perServing`
 * feeds {@link Nutrition}-shaped UI directly (empty `{}` when nothing sourced, so
 * it flows through `hasNutrition`/`NutritionPanel` and renders nothing); `whole`
 * is the same figures before dividing by servings. The coverage numbers keep a
 * partial estimate honest, on two axes:
 *  - **lines**: `sourcedLines` of `totalLines` contributed (`lineCoverage`).
 *  - **mass**: `accountedGrams` of `weighableGrams` were actually costed
 *    (`massCoverage`) — i.e. of the mass we *could* weigh, how much also had
 *    curated facts. A big unlinked ingredient drags this down even when most
 *    lines matched, which is exactly the honesty we want.
 */
export type RecipeNutritionEstimate = {
  /** Per-serving macros (empty `{}` when nothing was sourced). */
  perServing: Nutrition;
  /** Whole-recipe macros = per-serving × servings (empty `{}` when none). */
  whole: Nutrition;
  /** Serving count the per-serving figures were divided by (>= 1). */
  servings: number;
  /** Ingredient lines that contributed to the totals. */
  sourcedLines: number;
  /** Ingredient lines considered. */
  totalLines: number;
  /** `sourcedLines / totalLines`, or 0 when there were no lines. */
  lineCoverage: number;
  /** Grams of the lines that contributed (had both weight and facts). */
  accountedGrams: number;
  /** Grams of every weighable line (whether or not it had facts). */
  weighableGrams: number;
  /** `accountedGrams / weighableGrams`, or 0 when nothing was weighable. */
  massCoverage: number;
};

/** An estimate with no contributing lines — the honest "nothing to show" shape. */
export function emptyRecipeNutrition(servings = 1): RecipeNutritionEstimate {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    perServing: {},
    whole: {},
    servings: s,
    sourcedLines: 0,
    totalLines: 0,
    lineCoverage: 0,
    accountedGrams: 0,
    weighableGrams: 0,
    massCoverage: 0,
  };
}

/**
 * Roll a list of pre-resolved ingredient lines up into a per-serving nutrition
 * estimate. A line contributes only when it can be both weighed (see
 * {@link resolveLineGrams}) *and* carries per-100 g facts; anything else is
 * skipped but still counted toward `totalLines` (and, when weighable,
 * `weighableGrams`) so the coverage numbers stay honest. Pure and
 * order-independent; a non-positive/non-finite `servings` is treated as 1.
 */
export function rollUpNutrition(
  lines: readonly ResolvedNutritionLine[],
  servings: number,
): RecipeNutritionEstimate {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 1;

  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let fiberG = 0;
  let sugarG = 0;
  let sodiumMg = 0;

  let sourcedLines = 0;
  let totalLines = 0;
  let accountedGrams = 0;
  let weighableGrams = 0;

  for (const line of lines) {
    totalLines += 1;
    const grams = resolveLineGrams(
      line.quantity,
      line.unit,
      line.densityGPerMl,
    );
    if (grams != null) weighableGrams += grams;

    const facts = line.facts;
    if (grams == null || !facts) continue;

    const per = grams / 100;
    kcal += facts.kcal * per;
    proteinG += facts.proteinG * per;
    carbsG += facts.carbsG * per;
    fatG += facts.fatG * per;
    fiberG += (facts.fiberG ?? 0) * per;
    sugarG += (facts.sugarG ?? 0) * per;
    sodiumMg += (facts.sodiumMg ?? 0) * per;

    accountedGrams += grams;
    sourcedLines += 1;
  }

  if (sourcedLines === 0) {
    return {
      ...emptyRecipeNutrition(s),
      totalLines,
      weighableGrams,
    };
  }

  const whole: Nutrition = {
    calories: kcal,
    proteinGrams: proteinG,
    carbsGrams: carbsG,
    fatGrams: fatG,
    fiberGrams: fiberG,
    sugarGrams: sugarG,
    sodiumMg: sodiumMg,
  };
  const perServing: Nutrition = {
    calories: kcal / s,
    proteinGrams: proteinG / s,
    carbsGrams: carbsG / s,
    fatGrams: fatG / s,
    fiberGrams: fiberG / s,
    sugarGrams: sugarG / s,
    sodiumMg: sodiumMg / s,
  };

  return {
    perServing,
    whole,
    servings: s,
    sourcedLines,
    totalLines,
    lineCoverage: totalLines === 0 ? 0 : sourcedLines / totalLines,
    accountedGrams,
    weighableGrams,
    massCoverage: weighableGrams === 0 ? 0 : accountedGrams / weighableGrams,
  };
}
