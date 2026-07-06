/**
 * Pure, framework-agnostic helpers for aggregating, presenting, and ordering
 * recipe ratings.
 *
 * `ratingSummary` aggregates raw star values; the rest turn an already-computed
 * `{ average, count }` summary into display-ready data and provide the "top
 * rated" ordering rule. Keeping it all pure makes these concerns trivially
 * unit-testable and reusable on the server and the client.
 */

/** An aggregated rating: average (1–5, one decimal) and how many ratings. */
export type RatingSummary = { average: number; count: number };

/** Aggregate 1–5 ratings into an average + count. */
export function ratingSummary(values: { value: number }[]): RatingSummary {
  if (values.length === 0) return { average: 0, count: 0 };
  const sum = values.reduce((acc, r) => acc + r.value, 0);
  return {
    average: Math.round((sum / values.length) * 10) / 10,
    count: values.length,
  };
}

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
