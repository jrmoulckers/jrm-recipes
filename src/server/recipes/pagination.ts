/** Default number of discover-feed recipes fetched per page. */
export const DISCOVER_PAGE_SIZE = 24;

/** Default number of saved versions returned per version-history page (#159). */
export const VERSION_HISTORY_PAGE_SIZE = 20;

/** Default number of timeline events read per page (#159). */
export const TIMELINE_EVENT_PAGE_SIZE = 50;

/**
 * Hard cap on the descendant forks folded into a lineage/timeline in a single
 * read (#159). Forks are a bounded side-list, not a paged feed, so we simply
 * refuse to load more than this many at once rather than growing unboundedly
 * with a recipe's popularity.
 */
export const FORK_LIST_CAP = 50;

/** A page of results plus the offset to fetch next, or null when exhausted. */
export type Paginated<T> = {
  items: T[];
  nextOffset: number | null;
};

/**
 * A keyset-paginated page: the rows plus an opaque cursor for the next page, or
 * null when the source is exhausted. Unlike {@link Paginated}, keyset paging
 * seeks by a stable row key instead of a numeric offset, so it stays correct
 * even as rows are inserted between page loads (#159).
 */
export type CursorPage<T, C> = {
  items: T[];
  nextCursor: C | null;
};

/**
 * Clamp a caller-supplied page size into a sane `[1, max]` window, falling back
 * to `fallback` for missing or non-finite input. Keeps a hostile or buggy
 * caller from requesting a zero/negative/huge page.
 */
export function clampPageSize(
  requested: number | undefined | null,
  fallback: number,
  max = 100,
): number {
  const n = requested ?? fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

/**
 * Turn an over-fetched batch (query for `limit + 1` rows) into a page of at
 * most `limit` items, deriving the next cursor from the last kept row. Fetching
 * one extra row is how we learn whether another page exists without a second
 * COUNT query; when the batch overflows, the last item on this page becomes the
 * cursor the next page seeks past.
 */
export function toCursorPage<T, C>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => C,
): CursorPage<T, C> {
  if (limit <= 0) return { items: [], nextCursor: null };
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit && items.length > 0;
  return {
    items,
    nextCursor: hasMore ? cursorOf(items[items.length - 1]!) : null,
  };
}

/**
 * Offset for the next page, or null when the feed is exhausted.
 *
 * A short page (fewer rows than `limit`) means we reached the end, so there is
 * no next offset. A full page implies there may be more, so advance by `limit`.
 */
export function nextPageOffset(
  offset: number,
  pageLength: number,
  limit: number,
): number | null {
  if (limit <= 0) return null;
  return pageLength >= limit ? offset + limit : null;
}
