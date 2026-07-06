/** Default number of discover-feed recipes fetched per page. */
export const DISCOVER_PAGE_SIZE = 24;

/** A page of results plus the offset to fetch next, or null when exhausted. */
export type Paginated<T> = {
  items: T[];
  nextOffset: number | null;
};

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
