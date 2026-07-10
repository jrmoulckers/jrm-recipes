/**
 * Pure "cook with what you have" coverage scoring (#277).
 *
 * The database narrows candidates to recipes that mention at least one pantry
 * item; this module computes how well each recipe is covered by the pantry and
 * ranks by most-matched, then fewest-missing. Matching is normalized (case,
 * punctuation, simple plurals) by reusing `normalizeIngredient`, so it stays in
 * sync with the substitutions matcher.
 */

import { normalizeIngredient } from "./substitutions";

/** Naive English singularization — enough to unify egg/eggs, tomato/tomatoes. */
function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("oes")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Normalize an ingredient/pantry string into a set of comparable word tokens. */
export function ingredientTokens(item: string): string[] {
  return normalizeIngredient(item)
    .split(" ")
    .filter(Boolean)
    .map(singularize)
    .filter((t) => t.length >= 2);
}

export type Coverage = { matched: number; total: number; missing: number };

/**
 * A recipe ingredient is "covered" by a pantry item when every token of the
 * pantry item appears among the ingredient's tokens (order-independent). So
 * "chicken" covers "boneless chicken breast", and "olive oil" covers "extra
 * virgin olive oil", but "salt" never covers "salted butter".
 */
function itemCovered(
  ingredientTokenSet: Set<string>,
  pantry: string[][],
): boolean {
  return pantry.some(
    (tokens) =>
      tokens.length > 0 && tokens.every((t) => ingredientTokenSet.has(t)),
  );
}

/** Coverage of a single recipe's ingredient list against a pantry token map. */
export function coverageFor(
  recipeIngredients: string[],
  pantryTokenSets: string[][],
): Coverage {
  const total = recipeIngredients.length;
  let matched = 0;
  for (const item of recipeIngredients) {
    const tokens = new Set(ingredientTokens(item));
    if (itemCovered(tokens, pantryTokenSets)) matched += 1;
  }
  return { matched, total, missing: total - matched };
}

export type CoverageInput = { ingredients: string[] };
export type WithCoverage<T> = T & { coverage: Coverage };

/**
 * Rank recipes by pantry coverage: most matched ingredients first, ties broken
 * by fewest missing, then by smaller recipes (a 4/4 beats a 4/8). Recipes with
 * zero matches are dropped.
 */
export function rankByCoverage<T extends CoverageInput>(
  recipes: T[],
  pantry: string[],
): WithCoverage<T>[] {
  const pantryTokenSets = pantry
    .map(ingredientTokens)
    .filter((tokens) => tokens.length > 0);
  if (pantryTokenSets.length === 0) return [];

  return recipes
    .map((recipe) => ({
      ...recipe,
      coverage: coverageFor(recipe.ingredients, pantryTokenSets),
    }))
    .filter((recipe) => recipe.coverage.matched > 0)
    .sort(
      (a, b) =>
        b.coverage.matched - a.coverage.matched ||
        a.coverage.missing - b.coverage.missing ||
        a.coverage.total - b.coverage.total,
    );
}
