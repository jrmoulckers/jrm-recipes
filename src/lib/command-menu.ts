/**
 * Pure, DOM-free helpers for the global command palette (issue #74). Kept
 * separate from the React component so the filtering and keyboard-index math are
 * unit-testable without rendering.
 */

/** A destination the palette can filter and jump to. */
export type NavCommand = {
  labelKey: string;
  label: string;
  href: string;
};

/**
 * Case-insensitive substring match of `query` against the (already localized)
 * nav labels. An empty query returns every item, so the palette shows all
 * destinations as quick links before the user types anything.
 */
export function filterNavCommands<T extends { label: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...items];
  return items.filter((item) => item.label.toLowerCase().includes(q));
}

/**
 * Wrap `index` into `[0, length)` so ArrowUp/ArrowDown cycle past either end of
 * the option list. Returns `-1` for an empty list (nothing to select).
 */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return ((index % length) + length) % length;
}
