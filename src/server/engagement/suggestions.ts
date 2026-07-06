/**
 * Pure helpers for folding a family suggestion into a recipe. Kept free of `db`
 * and `server-only` so the merge shape can be unit-tested without a database.
 *
 * Suggestions carry free-text `body` only (no structured ingredient/step
 * target), so "applying" one means appending its text — credited to the
 * contributor — to the recipe's notes, which the owner can then refine.
 */

const FALLBACK_CONTRIBUTOR = "a family cook";

/** Normalise a contributor's display name, falling back when it's blank. */
export function contributorLabel(
  author: { name?: string | null; handle?: string | null } | null | undefined,
): string {
  const name = author?.name?.trim();
  if (name) return name;
  const handle = author?.handle?.trim();
  if (handle) return handle;
  return FALLBACK_CONTRIBUTOR;
}

/**
 * Merge a suggestion's text into a recipe's existing notes, attributing the
 * contributor. Returns the suggestion line alone when there are no notes yet,
 * otherwise appends it after a blank line so each applied tweak reads as its
 * own paragraph. Empty suggestions leave the notes untouched.
 */
export function mergeSuggestionIntoNotes(
  existingNotes: string | null | undefined,
  suggestionBody: string,
  contributor: string,
): string {
  const suggestion = suggestionBody.trim();
  const base = existingNotes?.trim() ?? "";
  if (!suggestion) return base;

  const who = contributor.trim() || FALLBACK_CONTRIBUTOR;
  const line = `${suggestion} — suggested by ${who}`;
  return base ? `${base}\n\n${line}` : line;
}
