/**
 * Presentation rules for a list's stores (#664).
 *
 * A list's title is always just its name. Stores are shown beside it and, when
 * there are too many to read comfortably, collapse into a concise overflow
 * count. The full set always stays available to assistive technology.
 */

export type StoreSummary = {
  id: string;
  name: string;
};

/** Chips wider than this read as a wall of text on a phone. */
export const STORE_CHIP_BUDGET = 34;
/** Beyond this many chips the row stops scanning as a list of places. */
export const STORE_CHIP_LIMIT = 3;

export type StoreDisplay = {
  /** Stores to render individually, in order. */
  visible: StoreSummary[];
  /** How many stores are folded into the overflow indicator. */
  overflowCount: number;
};

/**
 * Decide how many store chips fit. Stores are kept in their given order and
 * dropped from the end, so the shopper's first store always survives. At least
 * one store is always shown — an overflow indicator on its own says nothing.
 */
export function planStoreDisplay(
  stores: readonly StoreSummary[],
  { budget = STORE_CHIP_BUDGET, limit = STORE_CHIP_LIMIT } = {},
): StoreDisplay {
  if (stores.length === 0) return { visible: [], overflowCount: 0 };

  const maxByCount = Math.min(stores.length, Math.max(limit, 1));
  let fitted = 1;
  let width = stores[0]!.name.length;
  for (let index = 1; index < maxByCount; index += 1) {
    width += stores[index]!.name.length;
    if (width > budget) break;
    fitted = index + 1;
  }

  return {
    visible: stores.slice(0, fitted),
    overflowCount: stores.length - fitted,
  };
}
