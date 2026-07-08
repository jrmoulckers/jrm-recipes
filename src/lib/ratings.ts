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

/**
 * A per-star rating distribution, ordered 5→1 for display. Each entry is the
 * number of ratings at that star value.
 */
export type RatingDistributionRow = { star: number; count: number };

/** Average + count + the 5→1 per-star distribution for a breakdown UI (#334). */
export type RatingBreakdown = RatingSummary & {
  distribution: RatingDistributionRow[];
};

/**
 * Aggregate 1–5 ratings into an average, a count, and a 5→1 per-star
 * distribution. Values are rounded to the nearest star and out-of-range values
 * are ignored, mirroring the DB range check. Always returns all five rows (a
 * star with no ratings has `count: 0`) so the bar chart renders consistently.
 */
export function ratingBreakdown(values: { value: number }[]): RatingBreakdown {
  const summary = ratingSummary(values);
  const counts = [0, 0, 0, 0, 0]; // index 0 → 1 star … index 4 → 5 stars
  for (const { value } of values) {
    const star = Math.round(value);
    if (star >= 1 && star <= 5) counts[star - 1]! += 1;
  }
  const distribution: RatingDistributionRow[] = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: counts[star - 1]!,
  }));
  return { average: summary.average, count: summary.count, distribution };
}


/**
 * Build a {@link RatingSummary} from denormalized aggregates (issue #154):
 * `recipes.ratingCount` + `recipes.ratingSum`. Same rounding as
 * {@link ratingSummary} so a card fed by the stored aggregates and one fed by a
 * raw ratings array render identically. Guards a zero/negative count.
 */
export function summaryFromAggregates(
  count: number,
  sum: number,
): RatingSummary {
  if (count <= 0) return { average: 0, count: 0 };
  return { average: Math.round((sum / count) * 10) / 10, count };
}

/**
 * A recipe author can't rate their own recipe (blocked at the rating mutation),
 * so drop any owner rating from a set before aggregating. This keeps the average
 * and rank honest even for pre-existing self-ratings. Returns the list unchanged
 * when there is no owner to exclude.
 */
export function excludeOwnerRatings<T extends { userId: string }>(
  ratings: T[],
  ownerId: string | null | undefined,
): T[] {
  if (!ownerId) return ratings;
  return ratings.filter((rating) => rating.userId !== ownerId);
}

/**
 * Prior used by the count-aware "top rated" score. A recipe's rank is pulled
 * toward {@link TOP_RATED_PRIOR_MEAN} until it has gathered enough ratings to
 * speak for itself, so a single 5-star can't leapfrog a well-reviewed favourite.
 * {@link TOP_RATED_PRIOR_COUNT} is how many "average" votes of confidence a
 * recipe must accrue before its own average dominates.
 */
export const TOP_RATED_PRIOR_MEAN = 3;
export const TOP_RATED_PRIOR_COUNT = 5;

/**
 * Bayesian/weighted rating: blends a recipe's own average with the prior mean,
 * weighted by how many ratings it has. Few ratings sit near the prior; many
 * converge on the true average. Kept in sync with the SQL ordering in the
 * recipes query layer so in-memory and database ranking agree.
 */
export function bayesianScore({ average, count }: RatingSummary): number {
  return (
    (average * count + TOP_RATED_PRIOR_MEAN * TOP_RATED_PRIOR_COUNT) /
    (count + TOP_RATED_PRIOR_COUNT)
  );
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
 * Comparator for the "top rated" order: unrated recipes always sort last, then
 * by a count-aware weighted score (see {@link bayesianScore}) so a lone 5-star
 * can't outrank a many-rating favourite, tie-broken by the most ratings and
 * then the raw average. Stable enough to feed straight into
 * `Array.prototype.sort`.
 */
export function compareByTopRated(a: RatingSummary, b: RatingSummary): number {
  const aRated = a.count > 0;
  const bRated = b.count > 0;
  if (aRated !== bRated) return aRated ? -1 : 1;
  const scoreDelta = bayesianScore(b) - bayesianScore(a);
  if (scoreDelta !== 0) return scoreDelta;
  if (b.count !== a.count) return b.count - a.count;
  return b.average - a.average;
}

/** Coerce an untrusted query-string value into a known sort option. */
export function parseRatingSort(
  value: string | string[] | undefined,
): RatingSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "top-rated" ? "top-rated" : "recent";
}
