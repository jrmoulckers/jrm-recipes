/**
 * Keepsake "hand-down" links (issue #407).
 *
 * A keepsake is just the recipe presented warmly with a personal note, so the
 * note + sender ride in the URL rather than a new table — nothing to migrate,
 * and the link is entirely self-describing. Access is still governed by the
 * recipe's own visibility (the keepsake route defers to `getRecipeForViewer`),
 * so an unlisted recipe carries its share token along exactly like a normal
 * share link and a private recipe never leaks.
 */

/** Longest personal note we put in a keepsake link (a heartfelt sentence or two). */
export const KEEPSAKE_NOTE_MAX = 500;
/** Longest "from" name. */
export const KEEPSAKE_FROM_MAX = 80;

export type KeepsakeMessage = {
  from: string | null;
  note: string | null;
};

function tidy(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  // Collapse runs of blank lines/spaces but keep single newlines so a note can
  // have simple line breaks; trim the ends and cap the length.
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Normalize the sender/note read off a keepsake URL. Always returns trimmed,
 * length-bounded values (or `null`), so the view never renders unbounded or
 * whitespace-only input.
 */
export function parseKeepsakeMessage(input: {
  from?: string | string[] | null;
  note?: string | string[] | null;
}): KeepsakeMessage {
  const first = (v: string | string[] | null | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return {
    from: tidy(first(input.from), KEEPSAKE_FROM_MAX),
    note: tidy(first(input.note), KEEPSAKE_NOTE_MAX),
  };
}

/**
 * Build the relative keepsake path for a recipe. Empty note/name/token are
 * omitted so the link stays as short as possible; values are length-bounded
 * before encoding.
 */
export function buildKeepsakePath(
  idOrSlug: string,
  message: { from?: string | null; note?: string | null; token?: string | null },
): string {
  const params = new URLSearchParams();
  const from = tidy(message.from, KEEPSAKE_FROM_MAX);
  const note = tidy(message.note, KEEPSAKE_NOTE_MAX);
  if (from) params.set("from", from);
  if (note) params.set("note", note);
  if (message.token) params.set("t", message.token);
  const query = params.toString();
  const base = `/recipes/${encodeURIComponent(idOrSlug)}/keepsake`;
  return query ? `${base}?${query}` : base;
}
