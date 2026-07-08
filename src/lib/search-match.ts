import { expandQueryTerms, normalizeTerm } from "~/lib/search-synonyms";

/**
 * Explaining *why* a recipe surfaced for a text query. A recipe can match on its
 * title, an ingredient, a tag, its cuisine, or its description — but a result
 * card looks identical either way. {@link deriveMatchReason} inspects the fields
 * already loaded for a result and reports the single most useful reason, which
 * the card renders as a subtle hint and/or a highlighted title substring.
 *
 * Pure and DB-free (mirrors `~/server/recipes/search.ts`) so it is shared by the
 * server query and the client card, and unit-tested in isolation.
 */

export const matchFieldValues = [
  "title",
  "ingredient",
  "tag",
  "cuisine",
  "description",
] as const;
export type MatchField = (typeof matchFieldValues)[number];

export type RecipeMatchReason = {
  /** The field whose text the query matched. */
  field: MatchField;
  /** The matched term (the query token or a known synonym of it). */
  term: string;
};

/** Human label for the "Matches {label}: …" hint. */
export function matchFieldLabel(field: MatchField): string {
  return field;
}

/** Ignore 1-char tokens so a stray letter never "matches" (and highlights) everything. */
const MIN_MATCH_LEN = 2;

/**
 * The set of terms a query is considered to match on: the whole normalized
 * query and each whitespace-delimited token, each widened to its known synonyms
 * (so "coriander" can be explained by an ingredient named "cilantro").
 */
function matchTermsFor(query: string): string[] {
  const whole = normalizeTerm(query);
  if (whole.length === 0) return [];
  const terms = new Set<string>();
  const add = (term: string) => {
    if (term.length < MIN_MATCH_LEN) return;
    for (const expanded of expandQueryTerms(term)) terms.add(expanded);
  };
  add(whole);
  for (const token of whole.split(" ")) add(token);
  return [...terms];
}

export type MatchReasonFields = {
  title: string;
  description?: string | null;
  cuisine?: string | null;
  tags?: readonly string[];
  ingredients?: readonly string[];
};

/**
 * Derive the single best match reason for a result, or `null` when the query is
 * empty or nothing recognizable matched. Fields are checked in descending order
 * of "explanatory value": a title match is shown by highlighting, so after that
 * an ingredient is the least obvious (and most trust-building) reason, then tag,
 * cuisine, and finally description.
 */
export function deriveMatchReason(
  fields: MatchReasonFields,
  query: string | undefined | null,
): RecipeMatchReason | null {
  if (query == null) return null;
  const terms = matchTermsFor(query);
  if (terms.length === 0) return null;

  const haystacks: [MatchField, readonly string[]][] = [
    ["title", [fields.title]],
    ["ingredient", fields.ingredients ?? []],
    ["tag", fields.tags ?? []],
    ["cuisine", fields.cuisine ? [fields.cuisine] : []],
    ["description", fields.description ? [fields.description] : []],
  ];

  for (const [field, values] of haystacks) {
    for (const value of values) {
      const lower = value.toLowerCase();
      for (const term of terms) {
        if (lower.includes(term)) return { field, term };
      }
    }
  }
  return null;
}

export type HighlightSegment = { text: string; hit: boolean };

/**
 * Split `text` into segments around case-insensitive occurrences of `term`,
 * marking matched runs with `hit: true`. Purely string-slicing — callers render
 * the segments as React text nodes, so there is no HTML injection surface (XSS
 * safe regardless of the recipe title's contents).
 */
export function splitHighlight(text: string, term: string): HighlightSegment[] {
  const needle = term.toLowerCase();
  if (needle.length < MIN_MATCH_LEN) return [{ text, hit: false }];
  const hay = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (;;) {
    const at = hay.indexOf(needle, cursor);
    if (at === -1) {
      if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (at > cursor) segments.push({ text: text.slice(cursor, at), hit: false });
    segments.push({ text: text.slice(at, at + term.length), hit: true });
    cursor = at + term.length;
  }
  return segments.length > 0 ? segments : [{ text, hit: false }];
}
