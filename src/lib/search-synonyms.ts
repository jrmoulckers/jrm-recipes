/**
 * A small, curated ingredient/term synonym dictionary for recipe search.
 *
 * Families write recipes with regional and heirloom names — "coriander" vs
 * "cilantro", "aubergine" vs "eggplant", "prawns" vs "shrimp". Because
 * `searchRecipes` matches the raw query string, those dishes never find each
 * other. {@link expandQueryTerms} widens a query to its known synonyms so the
 * match set covers all the spellings a family might use.
 *
 * This module is intentionally pure (no DB / `server-only` import), mirroring
 * `~/server/recipes/search.ts`, so it can be shared and unit-tested freely. The
 * list is deliberately food-focused and small — quality over coverage.
 */

/**
 * Bidirectional synonym groups: every term in a group is treated as equivalent
 * to the others. Keep entries lowercase; {@link normalizeTerm} lowercases and
 * collapses whitespace on lookup so callers don't have to.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Herbs & produce (US / UK / regional names)
  ["cilantro", "coriander", "fresh coriander"],
  ["eggplant", "aubergine"],
  ["zucchini", "courgette"],
  ["arugula", "rocket"],
  [
    "scallion",
    "scallions",
    "green onion",
    "green onions",
    "spring onion",
    "spring onions",
  ],
  ["snow pea", "snow peas", "mangetout"],
  ["beet", "beets", "beetroot"],
  ["bell pepper", "bell peppers", "capsicum", "sweet pepper"],
  ["chickpea", "chickpeas", "garbanzo", "garbanzo beans"],
  ["fava bean", "fava beans", "broad bean", "broad beans"],
  ["romaine", "cos lettuce", "cos"],
  ["golden raisin", "golden raisins", "sultana", "sultanas"],
  ["raisin", "raisins", "currant", "currants"],
  // Proteins
  ["shrimp", "prawn", "prawns"],
  ["ground beef", "minced beef", "beef mince", "hamburger meat"],
  ["ground pork", "minced pork", "pork mince"],
  // Pantry / baking
  ["all purpose flour", "plain flour", "all-purpose flour"],
  ["cornstarch", "cornflour", "corn starch"],
  [
    "powdered sugar",
    "confectioners sugar",
    "icing sugar",
    "confectioner's sugar",
  ],
  ["superfine sugar", "caster sugar", "castor sugar"],
  ["baking soda", "bicarbonate of soda", "bicarb"],
  ["heavy cream", "double cream", "whipping cream"],
  ["molasses", "treacle", "black treacle"],
  ["golden syrup", "light treacle"],
  // Techniques a searcher might phrase either way
  ["barbecue", "bbq", "barbeque"],
  ["broil", "grill"],
];

/** Lowercase + collapse internal whitespace so lookups are forgiving. */
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Precomputed map from a normalized term to its distinct synonyms. */
const SYNONYM_MAP: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const normalized = group.map(normalizeTerm).filter(Boolean);
    for (const term of normalized) {
      const bucket = map.get(term) ?? new Set<string>();
      for (const other of normalized) {
        if (other !== term) bucket.add(other);
      }
      map.set(term, bucket);
    }
  }
  return new Map([...map].map(([term, set]) => [term, [...set]]));
})();

/** Synonyms known for a single term (empty when none), for reuse/testing. */
export function synonymsFor(term: string): string[] {
  return [...(SYNONYM_MAP.get(normalizeTerm(term)) ?? [])];
}

/**
 * The maximum number of *extra* synonym terms appended to a query, so an
 * expansion can never blow up the generated SQL (each term adds a set of
 * OR'd `ILIKE` conditions).
 */
export const MAX_SYNONYM_EXPANSION = 6;

/**
 * Expand a search query to the original term plus its known synonyms.
 *
 * The original (normalized) query always comes first and is always present,
 * even when it has no synonyms. Results are de-duplicated and capped at
 * `1 + MAX_SYNONYM_EXPANSION` entries. An empty/whitespace query yields `[]`.
 */
export function expandQueryTerms(
  q: string,
  max: number = MAX_SYNONYM_EXPANSION,
): string[] {
  const original = normalizeTerm(q);
  if (original.length === 0) return [];

  const seen = new Set<string>([original]);
  const result = [original];
  const cap = Math.max(0, max);

  for (const synonym of SYNONYM_MAP.get(original) ?? []) {
    if (result.length - 1 >= cap) break;
    if (!seen.has(synonym)) {
      seen.add(synonym);
      result.push(synonym);
    }
  }
  return result;
}
