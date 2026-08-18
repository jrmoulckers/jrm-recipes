import { and, gte, isNotNull, lte, not, or, sql, type SQL } from 'drizzle-orm';

import { CONFIDENCE_WEIGHT } from '~/lib/food-grams';
import { NUTRIENTS, type Nutrition } from '~/lib/nutrition';
import { nutritionResolverVersion } from '~/lib/nutrition-version';
import { type RecipeNutritionView } from '~/lib/recipe-nutrition';
import { recipes } from '~/server/db/schema/recipes';

import type { NutritionDb } from './nutrition-compute';
import {
  MACRO_SORT_NUTRIENTS,
  activeMacroFilters,
  isMacroSort,
  type MacroNutrientKey,
  type RecipeSearch,
} from './search';

/**
 * Ranking recipes by macros, honestly (#1047).
 *
 * ## Why this needs a rule at all
 *
 * On the recipe page a nutrition figure sits beside the ingredient list, so a
 * cook can weigh the number against what they can see. In a filtered result list
 * there is no ingredient list. A recipe appearing under "at least 30 g protein"
 * *is* the claim, and the claim is all the user gets. So the question this
 * module answers is not "what are this recipe's macros?" — `getRecipeNutritionView`
 * owns that — but "do we know them well enough to rank on them?".
 *
 * ## The rule
 *
 * A recipe is **rankable** for a nutrient when it has a per-serving value for
 * that nutrient and either:
 *
 * - the value is the cook's own ({@link RecipeNutritionView} provenance
 *   `manual`), which is an assertion rather than an inference and is not ours to
 *   second-guess; or
 * - the value is derived (`graph`/`estimate`) with `confidence >=`
 *   {@link MACRO_CONFIDENCE_FLOOR}.
 *
 * Anything else is **withheld**: excluded from the ranked results, counted, and
 * disclosed — because quietly returning fewer results is its own kind of
 * dishonesty. {@link countUnrankableByMacro} produces the numbers the disclosure
 * shows, and `?showUncertain=1` drops the floor so the user can see the shaky
 * estimates for themselves, each marked with its confidence.
 *
 * ## The deliberate asymmetry
 *
 * A low-confidence value is not trusted to *include* a recipe, but it is trusted
 * to *exclude* one: a recipe whose shaky estimate says 4 g of protein does not
 * appear under "at least 30 g", and is not reported as withheld. That is not an
 * oversight. Inclusion is an assertion the user reads as fact; exclusion asserts
 * nothing. When the data is weak, erring toward the claim we are not making is
 * the conservative direction.
 *
 * ## Where the numbers come from
 *
 * Both branches of the precedence ladder, in the same order
 * `getRecipeNutritionView` applies them:
 *
 * - `recipes.calories`/`proteinGrams`/… are the **cook's manually entered**
 *   per-serving figures (#414) — not, despite the wording in `nutrients.ts`, a
 *   denormalized cache of derived nutrition. Most recipes have none of them.
 * - `recipe_nutrition_cache.perServing` (#1044) holds the derived answer for
 *   everything else, with its `confidence` and `source` in the same row.
 *
 * Reading only the first would rank the small minority of hand-annotated
 * recipes; reading only the second would ignore the cook's own numbers, which
 * outrank everything. The SQL below mirrors the ladder exactly, including its
 * short-circuit: when a recipe carries *any* manual nutrient, the cache is not
 * consulted at all, so a recipe with a manual calorie count but no manual
 * protein is unrankable by protein — precisely what the recipe page would show.
 */

/**
 * The confidence a derived estimate must reach to be ranked on.
 *
 * Deliberately *the same number* the gram resolver already assigns to its
 * loosest accepted path — a density applied to a volume (`CONFIDENCE_WEIGHT.density`,
 * 0.6) — rather than a round threshold picked for feel. A recipe at or above it
 * is, at worst, one whose every line was weighed by a method the system already
 * accepts. Below it, either the mass was never weighed or unresolved lines have
 * diluted the score, and the figure is extrapolation over food nobody weighed.
 *
 * Bound to the constant, not copied from it: retuning the resolver's trust in a
 * density retunes what search is willing to rank, which is the correct coupling.
 */
export const MACRO_CONFIDENCE_FLOOR: number = CONFIDENCE_WEIGHT.density;

/** The cache sources that carry a derived (and therefore rankable) figure. */
const DERIVED_SOURCES = ['graph', 'estimate'] as const;

/**
 * One thing the query needs to know about a recipe's macros: either a bound to
 * satisfy, or merely that the value exists (which is what a macro *sort* needs —
 * ordering by protein asserts that we know each recipe's protein).
 */
export type MacroRequirement =
  | { nutrient: MacroNutrientKey; kind: 'min' | 'max'; value: number }
  | { nutrient: MacroNutrientKey; kind: 'present' };

/**
 * What a search demands of a recipe's macros: every active bound, plus a
 * presence requirement for a macro sort's nutrient when nothing already bounds
 * it. Empty when the search neither filters nor sorts on nutrition, which is the
 * signal for every caller here to add nothing at all.
 */
export function macroRequirements(search: RecipeSearch): MacroRequirement[] {
  const out: MacroRequirement[] = activeMacroFilters(search).map((f) => ({
    nutrient: f.nutrient,
    kind: f.direction,
    value: f.value,
  }));
  if (isMacroSort(search.sort)) {
    const nutrient = MACRO_SORT_NUTRIENTS[search.sort];
    if (!out.some((r) => r.nutrient === nutrient)) out.push({ nutrient, kind: 'present' });
  }
  return out;
}

/**
 * True when the recipe carries any manually entered nutrient, which is what
 * makes the cook's figures win the ladder. Mirrors `hasNutrition(manual)` —
 * *any* nutrient, not the one being filtered on — because that is the condition
 * `getRecipeNutritionView` short-circuits on.
 */
function manualPresentSql(): SQL {
  return or(...NUTRIENTS.map((n) => isNotNull(recipes[n.key])))!;
}

function manualRequirementSql(req: MacroRequirement): SQL {
  const column = recipes[req.nutrient];
  if (req.kind === 'present') return isNotNull(column);
  return and(
    isNotNull(column),
    req.kind === 'min' ? gte(column, req.value) : lte(column, req.value),
  )!;
}

/**
 * A nutrient's value inside the cached JSON payload. An absent key yields SQL
 * `NULL`, which is the point: after #1028 a nutrient nothing sourced is
 * *unknown*, and `->>` preserves that rather than defaulting it to a confident
 * zero.
 */
function cachedValueSql(nutrient: MacroNutrientKey): SQL {
  return sql`(rnc.per_serving ->> ${nutrient})::double precision`;
}

function cachedRequirementSql(req: MacroRequirement): SQL {
  const value = cachedValueSql(req.nutrient);
  if (req.kind === 'present') return sql`${value} IS NOT NULL`;
  return req.kind === 'min' ? sql`${value} >= ${req.value}` : sql`${value} <= ${req.value}`;
}

/** How much confidence the cached row must carry to be usable. */
type ConfidenceGate =
  /** At or above the floor: trustworthy enough to rank on. */
  | 'rankable'
  /** Below the floor: a real number we decline to rank on. */
  | 'below-floor'
  /** Any confidence at all. Used to ask "is there a number here?". */
  | 'any';

function confidenceGateSql(gate: ConfidenceGate): SQL | undefined {
  switch (gate) {
    case 'rankable':
      return sql`rnc.confidence >= ${MACRO_CONFIDENCE_FLOOR}`;
    case 'below-floor':
      return sql`rnc.confidence IS NOT NULL AND rnc.confidence < ${MACRO_CONFIDENCE_FLOOR}`;
    case 'any':
      return undefined;
  }
}

/**
 * `EXISTS` a cached row for this recipe, from the *current* resolver, carrying a
 * derived figure that meets `gate` and satisfies every requirement.
 *
 * Written as raw SQL with its own `rnc` alias rather than through the query
 * builder: inside the relational query builder a drizzle column reference in a
 * `sql` template is re-qualified to the root `recipes` alias, so a subquery's
 * own columns have to be spelled out to keep their scope. `recipes.id` is the
 * root here, so it is the one reference that must stay a drizzle column.
 *
 * A row stamped with a superseded `resolver_version` is skipped exactly as
 * `readCachedNutritionView` skips it — its numbers answer a question nobody is
 * asking any more, and ranking on them would resurrect values the version bump
 * retired.
 */
function cachedRowExistsSql(requirements: MacroRequirement[], gate: ConfidenceGate): SQL {
  const conditions = [
    sql`rnc.recipe_id = ${recipes.id}`,
    sql`rnc.resolver_version = ${nutritionResolverVersion()}`,
    sql`rnc.source IN (${sql.join(
      DERIVED_SOURCES.map((s) => sql`${s}`),
      sql`, `,
    )})`,
    confidenceGateSql(gate),
    ...requirements.map(cachedRequirementSql),
  ].filter((c): c is SQL => c != null);

  return sql`EXISTS (SELECT 1 FROM recipe_nutrition_cache rnc WHERE ${and(...conditions)})`;
}

/** The precedence ladder as a predicate: manual figures, else the cache. */
function satisfiesMacrosSql(requirements: MacroRequirement[], gate: ConfidenceGate): SQL {
  const manualPresent = manualPresentSql();
  return or(
    and(manualPresent, ...requirements.map(manualRequirementSql))!,
    and(not(manualPresent), cachedRowExistsSql(requirements, gate))!,
  )!;
}

/** Drop every requirement to bare presence: "is there a number for this?". */
function asPresence(requirements: MacroRequirement[]): MacroRequirement[] {
  return requirements.map((r) => ({ nutrient: r.nutrient, kind: 'present' }) as const);
}

/**
 * The WHERE fragment for a search's macro bounds and macro sort, or `[]` when it
 * uses neither. Composes with every other filter — it narrows `recipes` and
 * never widens the row set.
 */
export function macroFilterConditions(search: RecipeSearch): SQL[] {
  const requirements = macroRequirements(search);
  if (requirements.length === 0) return [];
  return [satisfiesMacrosSql(requirements, search.showUncertain ? 'any' : 'rankable')];
}

/**
 * The effective per-serving value to order by, as a scalar expression: the
 * cook's own figure when they entered any nutrient, otherwise the cached derived
 * one, subject to the same confidence gate the WHERE applied. The gate is
 * repeated here rather than assumed, so the ORDER BY can never rank on a value
 * the WHERE would have refused.
 */
function effectiveValueSql(nutrient: MacroNutrientKey, gate: ConfidenceGate): SQL {
  const conditions = [
    sql`rnc.recipe_id = ${recipes.id}`,
    sql`rnc.resolver_version = ${nutritionResolverVersion()}`,
    sql`rnc.source IN (${sql.join(
      DERIVED_SOURCES.map((s) => sql`${s}`),
      sql`, `,
    )})`,
    confidenceGateSql(gate),
  ].filter((c): c is SQL => c != null);

  return sql`CASE WHEN ${manualPresentSql()} THEN ${recipes[nutrient]}::double precision ELSE (
    SELECT ${cachedValueSql(nutrient)} FROM recipe_nutrition_cache rnc WHERE ${and(...conditions)}
  ) END`;
}

/**
 * ORDER BY for a macro sort, or `null` when the sort is not one. Ties break on
 * title so paging is stable — without a total order, `limit`/`offset` can show
 * the same recipe twice across two pages.
 *
 * No `NULLS` handling is needed: the WHERE has already required the value to
 * exist, because a recipe placed *anywhere* in a protein ordering is being
 * ranked on its protein.
 */
export function macroOrderBy(search: RecipeSearch): SQL[] | null {
  if (!isMacroSort(search.sort)) return null;
  const nutrient = MACRO_SORT_NUTRIENTS[search.sort];
  const value = effectiveValueSql(nutrient, search.showUncertain ? 'any' : 'rankable');
  const title = sql`lower(${recipes.title}) asc`;
  return search.sort === 'protein-high' ? [sql`${value} desc`, title] : [sql`${value} asc`, title];
}

/**
 * What a macro filter refused to rank, so the UI can say so.
 *
 * - `lowConfidence` — recipes that would appear if the floor were dropped.
 *   Deliberately the exact population `?showUncertain=1` reveals, so the number
 *   in the disclosure equals the number of cards that appear when the user acts
 *   on it. A count that promised more than it delivered would be its own small
 *   dishonesty.
 * - `unknown` — recipes that passed every other filter but for which we hold no
 *   per-serving figure at all for the nutrients in play, at any confidence.
 *   These can never be shown: there is nothing to show. They are disclosed so
 *   "6 results" is not mistaken for "6 recipes qualify".
 *
 * The two are disjoint by construction (`lowConfidence` requires a non-null
 * value; `unknown` requires its absence) and neither counts a recipe that is
 * already in the results.
 */
export type UnrankableCounts = { lowConfidence: number; unknown: number };

export const NO_UNRANKABLE: UnrankableCounts = { lowConfidence: 0, unknown: 0 };

/**
 * Count what the macro gate withheld, over the *same* base conditions the search
 * ran with (visibility scope and every non-macro filter) so the numbers describe
 * this result set rather than the corpus.
 *
 * One query, two conditional aggregates. Never throws: a count that cannot be
 * taken degrades to "nothing withheld", which understates the disclosure rather
 * than inventing one.
 */
export async function countUnrankableByMacro(
  db: NutritionDb,
  baseConditions: SQL[],
  search: RecipeSearch,
): Promise<UnrankableCounts> {
  const requirements = macroRequirements(search);
  if (requirements.length === 0) return NO_UNRANKABLE;

  const presence = asPresence(requirements);
  // Would have matched, but only on a figure we decline to rank.
  const lowConfidence = and(
    not(manualPresentSql()),
    cachedRowExistsSql(requirements, 'below-floor'),
  )!;
  // No figure at all for at least one nutrient in play, from either branch.
  const unknown = and(
    not(and(manualPresentSql(), ...presence.map(manualRequirementSql))!),
    not(cachedRowExistsSql(presence, 'any')),
  )!;

  try {
    const [row] = await db
      .select({
        lowConfidence: sql<number>`count(*) filter (where ${lowConfidence})::int`,
        unknown: sql<number>`count(*) filter (where ${unknown})::int`,
      })
      .from(recipes)
      .where(and(...baseConditions));
    return {
      lowConfidence: Number(row?.lowConfidence ?? 0),
      unknown: Number(row?.unknown ?? 0),
    };
  } catch {
    return NO_UNRANKABLE;
  }
}

/**
 * The per-serving figures a result card shows, with the provenance that makes
 * them readable as an estimate rather than a fact.
 *
 * The views themselves come from `getRecipeNutritionViews` (#1048) — the batched
 * sibling of `getRecipeNutritionView`, applying the identical ladder over one
 * manual-columns query plus one cached-row read. A page of cards therefore costs
 * two queries rather than sixty, and there is still exactly one place that
 * decides what a recipe's nutrition is. This module only projects that answer;
 * it never reads or resolves nutrition itself.
 */
export type MacroCardSummary = {
  perServing: Nutrition;
  source: 'manual' | 'graph' | 'estimate';
  /** 0–1 for a derived figure; `null` for the cook's own. */
  confidence: number | null;
  /** True when the figure is below {@link MACRO_CONFIDENCE_FLOOR}. */
  uncertain: boolean;
};

/**
 * Project a view onto what a card shows, or `null` when there is nothing to
 * show. `uncertain` is what the card marks: a figure below the floor is only on
 * screen because the viewer asked for it, and must not read like the rest.
 */
export function toMacroCardSummary(view: RecipeNutritionView | undefined): MacroCardSummary | null {
  if (!view) return null;
  const p = view.provenance;
  if (p.source === 'none') return null;
  if (p.source === 'manual') {
    return { perServing: view.perServing, source: 'manual', confidence: null, uncertain: false };
  }
  return {
    perServing: view.perServing,
    source: p.source,
    confidence: p.confidence,
    uncertain: p.confidence < MACRO_CONFIDENCE_FLOOR,
  };
}

/** The nutrients a card should print, given what the search ranked on. */
export function macroCardNutrients(search: RecipeSearch): MacroNutrientKey[] {
  const seen = new Set<MacroNutrientKey>();
  for (const req of macroRequirements(search)) seen.add(req.nutrient);
  return [...seen];
}
