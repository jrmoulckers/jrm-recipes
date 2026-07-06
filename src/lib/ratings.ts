/**
 * Pure, framework-agnostic helpers for presenting and ordering recipe ratings.
 *
 * Aggregation of raw star values lives in `ratingSummary` (server queries); this
 * module only turns an already-computed `{ average, count }` summary into
 * display-ready data and provides the "top rated" ordering rule. Keeping it pure
 * makes both concerns trivially unit-testable and reusable on the client.
 */

/** An aggregated rating: average (1–5, one decimal) and how many ratings. */
export type RatingSummary = { average: number; count: number };

/** Ways the recipe lists can be ordered. */
export type RatingSort = "recent" | "top-rated";

/** The full set of sort options, handy for building UI controls. */
export const RATING_SORTS: readonly RatingSort[] = ["recent", "top-rated"];

/** Human labels for each sort option. */
export const RATING_SORT_LABELS: Record<RatingSort, string> = {
  recent: "Recent",
  "top-rated": "Top rated",
};

/** Whole number of filled stars (0–5) for a compact star row. */
export function filledStars(average: number): number {
  if (!Number.isFinite(average) || average <= 0) return 0;
  return Math.min(5, Math.max(0, Math.round(average)));
}

/** Display model for a compact star rating on a card. */
export type RatingDisplay =
  | { unrated: true }
  | {
      unrated: false;
      average: number;
      count: number;
      filled: number;
      /** Accessible label for an icon-only star row. */
      label: string;
    };

/** Turn a rating summary into display data, flagging the unrated case. */
export function ratingDisplay(summary: RatingSummary): RatingDisplay {
  if (summary.count <= 0) return { unrated: true };
  const filled = filledStars(summary.average);
  const noun = summary.count === 1 ? "rating" : "ratings";
  return {
    unrated: false,
    average: summary.average,
    count: summary.count,
    filled,
    label: `${summary.average.toFixed(1)} out of 5 stars, ${summary.count} ${noun}`,
  };
}

/**
 * Comparator for the "top rated" order: highest average first, then the most
 * ratings as a tie-breaker, and unrated recipes always last. Stable enough to
 * feed straight into `Array.prototype.sort`.
 */
export function compareByTopRated(a: RatingSummary, b: RatingSummary): number {
  const aRated = a.count > 0;
  const bRated = b.count > 0;
  if (aRated !== bRated) return aRated ? -1 : 1;
  if (b.average !== a.average) return b.average - a.average;
  return b.count - a.count;
}

/** Coerce an untrusted query-string value into a known sort option. */
export function parseRatingSort(
  value: string | string[] | undefined,
): RatingSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "top-rated" ? "top-rated" : "recent";
}
