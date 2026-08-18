/**
 * Ingredient → nutrition roll-up (Phase 4 hub-wiring, `docs/food-graph.md` §8).
 *
 * Where {@link estimateRecipeNutrition} in `food-nutrition.ts` resolves facts by
 * *text* against the static curated dataset, this module rolls up nutrition from
 * lines that have *already* been resolved against the live food graph, each
 * carrying the canonical food's per-100 g {@link NutritionFacts} and its
 * `densityGPerMl`, looked up server-side via the `recipe_ingredients.foodId` FK.
 * That makes the recipe-detail estimate authoritative rather than best-guess.
 *
 * Everything here is pure and framework-free (gram resolution is delegated to
 * `food-grams.ts`), so the summation, coverage, and servings-scaling are
 * exhaustively unit-testable and never touch the database. Nothing throws:
 * an unweighable or unresolved line is simply skipped and reflected honestly in
 * the coverage numbers.
 */

import { resolveGramsForSlug } from '~/lib/food-grams';
import {
  estimatePerServingNutrition,
  type NutritionFacts,
  type NutritionIngredient,
} from '~/lib/food-nutrition';
import { hasNutrition, type Nutrition } from '~/lib/nutrition';

/**
 * One ingredient line ready for the roll-up. `facts` and `densityGPerMl` come
 * from the canonical food the line's `foodId` resolves to. Both are optional
 * because the link is best-effort. A `null`/absent value just means that piece
 * of information is unknown for this line.
 */
export type ResolvedNutritionLine = {
  quantity?: number | null;
  unit?: string | null;
  /** Per-100 g facts for the line's food, or null when unlinked/uncurated. */
  facts?: NutritionFacts | null;
  /** g/mL for the line's food, or null when count-measured / unknown. */
  densityGPerMl?: number | null;
  /**
   * The canonical food's slug, used to look up a curated household-measure
   * weight in `food-portions.ts`. Without it a count-measured line (`2 eggs`,
   * `3 cloves garlic`) has no gram path at all and is silently dropped.
   */
  slug?: string | null;
};

/**
 * Resolve the grams of a single ingredient line. Delegates to the shared
 * {@link resolveGramsForSlug}, which tries mass arithmetic, then a curated
 * per-food portion for the unit, then volume via density. Returns `null` when no
 * path exists — meaning "unknown weight", never zero. Never throws.
 *
 * Passing `slug` is what unlocks the `count` dimension and every density-less
 * volume measure; omitting it preserves the original mass/density-only
 * behaviour.
 */
export function resolveLineGrams(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  densityGPerMl: number | null | undefined,
  slug?: string | null,
): number | null {
  return resolveGramsForSlug(slug ?? null, quantity, unit, densityGPerMl)?.grams ?? null;
}

/**
 * A recipe nutrition estimate rolled up from its ingredient lines. `perServing`
 * feeds {@link Nutrition}-shaped UI directly (empty `{}` when nothing sourced, so
 * it flows through `hasNutrition`/`NutritionPanel` and renders nothing). `whole`
 * is the same figures before dividing by servings. The coverage numbers keep a
 * partial estimate honest, on two axes:
 *  - **lines**: `sourcedLines` of `totalLines` contributed (`lineCoverage`).
 *  - **mass**: `accountedGrams` of `weighableGrams` were actually costed
 *    (`massCoverage`). I.e. Of the mass we *could* weigh, how much also had
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

/** An estimate with no contributing lines. The honest "nothing to show" shape. */
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
 * {@link resolveLineGrams}) *and* carries per-100 g facts. Anything else is
 * skipped but still counted toward `totalLines` (and, when weighable,
 * `weighableGrams`) so the coverage numbers stay honest. The function is pure
 * and order-independent. A non-positive/non-finite `servings` is treated as 1.
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
    const grams = resolveLineGrams(line.quantity, line.unit, line.densityGPerMl, line.slug);
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

/**
 * How a recipe's displayed nutrition was arrived at, carried as a **value**
 * rather than re-derived by each consumer (#1029).
 *
 * Before this union, precedence — manual override, then the food-graph
 * estimate, then the free-text estimate — lived inside a `useMemo` in
 * `ingredients-panel.tsx`. That meant the server could not answer "what is this
 * recipe's nutrition?" the way the UI did, so every new consumer (search
 * filters, meal-plan roll-ups, cook-log totals, export) either reimplemented the
 * ladder or silently used a different one. Search disagreeing with the recipe
 * page is the failure users report as "the app is wrong" rather than as a bug
 * with a location.
 *
 * The tag is now decided once, in {@link resolveNutritionView}, and rendered
 * (never decided) by the panel.
 *
 * `confidence` is the fraction of ingredient lines that actually contributed —
 * an interim honesty metric that #1027's confidence roll-up replaces. It is
 * deliberately absent from `manual` (a cook's own numbers are not an estimate)
 * and from `none` (there is nothing to be confident about).
 */
export type NutritionProvenance =
  | { source: 'manual' }
  | { source: 'graph'; confidence: number; sourcedLines: number; totalLines: number }
  | { source: 'estimate'; confidence: number; sourcedLines: number; totalLines: number }
  | { source: 'none' };

/**
 * The single answer to "what is this recipe's per-serving nutrition, and where
 * did it come from?". `perServing` is empty (`{}`) exactly when `provenance.source`
 * is `none`, so it flows through `hasNutrition`/`NutritionPanel` and renders
 * nothing.
 */
export type RecipeNutritionView = {
  /** Per-serving macros, or `{}` when nothing could be sourced. */
  perServing: Nutrition;
  /** Where the figures came from, and how complete they are. */
  provenance: NutritionProvenance;
};

/** The honest "nothing to show" view. */
export function emptyNutritionView(): RecipeNutritionView {
  return { perServing: {}, provenance: { source: 'none' } };
}

/**
 * Apply the one precedence ladder: the cook's own numbers win, then the
 * food-graph estimate (resolved via each line's `foodId` → curated per-100 g
 * facts), then the free-text estimate matched against the static curated
 * dataset, then nothing.
 *
 * The graph outranks the text estimate because it resolves the *linked*
 * canonical food rather than guessing from phrasing. The text estimate is still
 * needed, and is not a legacy path: plenty of foods match the curated dataset
 * without having a graph node, and offline/unsaved surfaces (the recipe editor's
 * "estimate from ingredients") have no `foodId` to resolve at all.
 *
 * Pure, framework-free, and safe on both the server and the client. Every field
 * is optional so a caller can supply only the inputs it has: omitting `graph`
 * yields the text path, omitting `ingredients` yields no text fallback.
 */
export function resolveNutritionView(input: {
  /** The cook's stored per-serving nutrition, when they entered any. */
  manual?: Nutrition | null;
  /** A server-computed food-graph roll-up, when one is available. */
  graph?: RecipeNutritionEstimate | null;
  /** Raw ingredient lines for the free-text fallback. */
  ingredients?: readonly NutritionIngredient[] | null;
  /** Servings the free-text estimate is divided by. Non-positive is treated as 1. */
  servings?: number | null;
}): RecipeNutritionView {
  const { manual, graph, ingredients, servings } = input;

  if (manual && hasNutrition(manual)) {
    return { perServing: manual, provenance: { source: 'manual' } };
  }

  if (graph && hasNutrition(graph.perServing)) {
    return {
      perServing: graph.perServing,
      provenance: {
        source: 'graph',
        confidence: graph.lineCoverage,
        sourcedLines: graph.sourcedLines,
        totalLines: graph.totalLines,
      },
    };
  }

  if (ingredients && ingredients.length > 0) {
    const est = estimatePerServingNutrition(
      ingredients,
      Number.isFinite(servings ?? NaN) && (servings ?? 0) > 0 ? servings! : 1,
    );
    if (hasNutrition(est.perServing)) {
      return {
        perServing: est.perServing,
        provenance: {
          source: 'estimate',
          confidence: est.coverage,
          sourcedLines: est.sourced,
          totalLines: est.total,
        },
      };
    }
  }

  return emptyNutritionView();
}
