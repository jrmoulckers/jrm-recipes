/**
 * "Cook once, eat twice" batch-cook helpers (#380).
 *
 * The meal planner already stores a nullable `recipeId` plus a free-form `note`
 * on every entry, so a leftovers night needs no schema change: it is simply a
 * second entry that points at the same recipe and carries a structured note we
 * can recognise. These pure helpers own that note convention so the client,
 * the server mutation, and any future surface all read and write it the same
 * way.
 */

/** Servings multiples offered in the batch-cook picker. */
export const BATCH_MULTIPLES = [2, 3] as const;
export type BatchMultiple = (typeof BATCH_MULTIPLES)[number];

/** Matches the planner `note` column limit / Drizzle varchar(300). */
const MAX_NOTE = 300;
const LEFTOVERS_PREFIX = "Leftovers · ";
const BATCH_SUFFIX = /\s·\s(\d+)×\sbatch$/;

export type LeftoversInfo = { title: string; multiple: BatchMultiple };

/** Clamp any incoming number to a supported multiple (defaults toward 2×). */
export function normalizeBatchMultiple(value: number): BatchMultiple {
  return value >= 3 ? 3 : 2;
}

/**
 * Build the note stored on a leftovers entry, e.g.
 * `"Leftovers · Weeknight Chili · 2× batch"`. Human-readable on its own (for
 * print/export) yet unambiguously parseable back into {title, multiple}.
 */
export function formatLeftoversNote(title: string, multiple: number): string {
  const clean = title.trim().replace(/\s+/g, " ") || "recipe";
  const mult = normalizeBatchMultiple(multiple);
  const suffix = ` · ${mult}× batch`;
  const room = MAX_NOTE - LEFTOVERS_PREFIX.length - suffix.length;
  const name = clean.length > room ? clean.slice(0, Math.max(1, room)).trim() : clean;
  return `${LEFTOVERS_PREFIX}${name}${suffix}`;
}

/** Parse a leftovers note back to its parts, or null if it isn't one. */
export function parseLeftoversNote(
  note: string | null | undefined,
): LeftoversInfo | null {
  if (!note?.startsWith(LEFTOVERS_PREFIX)) return null;
  const match = BATCH_SUFFIX.exec(note);
  if (!match) return null;
  const multiple = normalizeBatchMultiple(Number(match[1]));
  const title = note.slice(LEFTOVERS_PREFIX.length, match.index).trim();
  if (!title) return null;
  return { title, multiple };
}

/** Cheap predicate for "is this entry a leftovers night?". */
export function isLeftoversNote(note: string | null | undefined): boolean {
  return parseLeftoversNote(note) != null;
}
