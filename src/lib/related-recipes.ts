/**
 * Pure scoring for "You might also like" related recipes (#275).
 *
 * The database narrows the candidate set to recipes that share a tag or cuisine;
 * this module turns the loaded signals into a comparable score so the ranking
 * logic stays testable without a live database.
 */

export type RecipeSignals = {
  tagSlugs: string[];
  cuisine: string | null;
  ingredientTokens: string[];
};

/**
 * Relative weights. Tags are the strongest signal of "similar dish"; a single
 * shared tag (5) always outranks the capped ingredient-overlap contribution (3),
 * so common pantry words like "salt" can never dominate topical relatedness.
 */
export const SIMILARITY_WEIGHTS = { tag: 5, cuisine: 2, ingredient: 1 } as const;

/** Ingredient overlap is capped so a long shared pantry list can't dominate. */
export const MAX_INGREDIENT_OVERLAP = 3;

/** Split ingredient item text into a deduped set of meaningful word tokens. */
export function tokenizeIngredients(items: string[]): string[] {
  const tokens = new Set<string>();
  for (const item of items) {
    for (const word of item.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 3) tokens.add(word);
    }
  }
  return [...tokens];
}

/** Weighted similarity between a source recipe and a candidate. */
export function similarityScore(
  source: RecipeSignals,
  candidate: RecipeSignals,
): number {
  const sourceTags = new Set(source.tagSlugs);
  const sharedTags = candidate.tagSlugs.filter((s) => sourceTags.has(s)).length;

  const sameCuisine =
    source.cuisine != null &&
    source.cuisine.toLowerCase() === candidate.cuisine?.toLowerCase()
      ? 1
      : 0;

  const sourceTokens = new Set(source.ingredientTokens);
  const overlap = Math.min(
    candidate.ingredientTokens.filter((t) => sourceTokens.has(t)).length,
    MAX_INGREDIENT_OVERLAP,
  );

  return (
    sharedTags * SIMILARITY_WEIGHTS.tag +
    sameCuisine * SIMILARITY_WEIGHTS.cuisine +
    overlap * SIMILARITY_WEIGHTS.ingredient
  );
}

/**
 * Rank candidates by similarity to `source`, dropping zero-score entries and
 * keeping at most `limit`. Ties preserve the incoming order (the caller pre-sorts
 * by recency), so the result is stable.
 */
export function rankBySimilarity<T extends { signals: RecipeSignals }>(
  source: RecipeSignals,
  candidates: T[],
  limit: number,
): T[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: similarityScore(source, candidate.signals),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.candidate);
}
