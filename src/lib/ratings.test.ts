import { describe, expect, it } from "vitest";

import {
  bayesianScore,
  compareByTopRated,
  excludeOwnerRatings,
  filledStars,
  parseRatingSort,
  ratingBreakdown,
  ratingDisplay,
  ratingSummary,
  summaryFromAggregates,
  TOP_RATED_PRIOR_MEAN,
} from "./ratings";

describe("ratingBreakdown (issue #334)", () => {
  it("returns an all-zero 5→1 distribution when empty", () => {
    const result = ratingBreakdown([]);
    expect(result).toEqual({
      average: 0,
      count: 0,
      distribution: [
        { star: 5, count: 0 },
        { star: 4, count: 0 },
        { star: 3, count: 0 },
        { star: 2, count: 0 },
        { star: 1, count: 0 },
      ],
    });
  });

  it("counts ratings per star in 5→1 order and keeps the average/count", () => {
    const result = ratingBreakdown([
      { value: 5 },
      { value: 5 },
      { value: 4 },
      { value: 1 },
    ]);
    expect(result.count).toBe(4);
    expect(result.average).toBe(3.8);
    expect(result.distribution).toEqual([
      { star: 5, count: 2 },
      { star: 4, count: 1 },
      { star: 3, count: 0 },
      { star: 2, count: 0 },
      { star: 1, count: 1 },
    ]);
  });

  it("rounds fractional values to the nearest star and ignores out-of-range", () => {
    const result = ratingBreakdown([
      { value: 4.6 },
      { value: 2.4 },
      { value: 0 },
      { value: 6 },
    ]);
    // 4.6 → 5, 2.4 → 2; 0 and 6 are dropped from the distribution.
    expect(result.distribution).toEqual([
      { star: 5, count: 1 },
      { star: 4, count: 0 },
      { star: 3, count: 0 },
      { star: 2, count: 1 },
      { star: 1, count: 0 },
    ]);
  });
});

describe("ratingSummary", () => {
  it("returns an empty summary when there are no ratings", () => {
    expect(ratingSummary([])).toEqual({ average: 0, count: 0 });
  });

  it("averages the star values and counts them", () => {
    expect(ratingSummary([{ value: 4 }, { value: 5 }, { value: 3 }])).toEqual({
      average: 4,
      count: 3,
    });
  });

  it("rounds the average to a single decimal place", () => {
    // (5 + 4 + 4) / 3 = 4.333… -> 4.3
    expect(ratingSummary([{ value: 5 }, { value: 4 }, { value: 4 }])).toEqual({
      average: 4.3,
      count: 3,
    });
    // (5 + 2) / 2 = 3.5
    expect(ratingSummary([{ value: 5 }, { value: 2 }])).toEqual({
      average: 3.5,
      count: 2,
    });
  });

  it("handles a single rating", () => {
    expect(ratingSummary([{ value: 3 }])).toEqual({ average: 3, count: 1 });
  });
});

describe("summaryFromAggregates", () => {
  it("returns an empty summary when the count is zero", () => {
    expect(summaryFromAggregates(0, 0)).toEqual({ average: 0, count: 0 });
  });

  it("treats a negative count as unrated (defensive)", () => {
    expect(summaryFromAggregates(-1, 4)).toEqual({ average: 0, count: 0 });
  });

  it("derives the average from sum / count", () => {
    // 12 / 3 = 4
    expect(summaryFromAggregates(3, 12)).toEqual({ average: 4, count: 3 });
  });

  it("rounds to one decimal, matching ratingSummary", () => {
    // 13 / 3 = 4.333… -> 4.3, identical to ratingSummary of the raw values.
    expect(summaryFromAggregates(3, 13)).toEqual({ average: 4.3, count: 3 });
    expect(summaryFromAggregates(3, 13)).toEqual(
      ratingSummary([{ value: 5 }, { value: 4 }, { value: 4 }]),
    );
  });
});

describe("filledStars", () => {
  it("rounds an average to a whole number of stars", () => {
    expect(filledStars(4.5)).toBe(5);
    expect(filledStars(4.4)).toBe(4);
    expect(filledStars(0.2)).toBe(0);
  });

  it("clamps to the 0–5 range and ignores junk input", () => {
    expect(filledStars(9)).toBe(5);
    expect(filledStars(-3)).toBe(0);
    expect(filledStars(Number.NaN)).toBe(0);
  });
});

describe("ratingDisplay", () => {
  it("flags recipes with no ratings as unrated", () => {
    expect(ratingDisplay({ average: 0, count: 0 })).toEqual({ unrated: true });
  });

  it("builds a compact display with an accessible label", () => {
    expect(ratingDisplay({ average: 4.5, count: 12 })).toEqual({
      unrated: false,
      average: 4.5,
      count: 12,
      filled: 5,
      label: "4.5 out of 5 stars, 12 ratings",
    });
  });

  it("uses the singular noun for a single rating", () => {
    const display = ratingDisplay({ average: 3, count: 1 });
    expect(display).toMatchObject({ label: "3.0 out of 5 stars, 1 rating" });
  });
});

describe("excludeOwnerRatings", () => {
  it("drops the recipe owner's own rating", () => {
    const ratings = [
      { userId: "owner_1", value: 5 },
      { userId: "fan_1", value: 4 },
      { userId: "fan_2", value: 3 },
    ];
    expect(excludeOwnerRatings(ratings, "owner_1")).toEqual([
      { userId: "fan_1", value: 4 },
      { userId: "fan_2", value: 3 },
    ]);
  });

  it("returns the list unchanged when there is no owner to exclude", () => {
    const ratings = [{ userId: "fan_1", value: 4 }];
    expect(excludeOwnerRatings(ratings, null)).toBe(ratings);
    expect(excludeOwnerRatings(ratings, undefined)).toBe(ratings);
  });
});

describe("bayesianScore", () => {
  it("shrinks a sparse rating toward the prior mean", () => {
    // A lone 5-star: (5*1 + 3*5) / (1 + 5) = 20 / 6 ≈ 3.33, far below 5.
    expect(bayesianScore({ average: 5, count: 1 })).toBeCloseTo(20 / 6, 5);
  });

  it("converges on the true average as ratings accumulate", () => {
    const few = bayesianScore({ average: 4.7, count: 3 });
    const many = bayesianScore({ average: 4.7, count: 400 });
    expect(many).toBeGreaterThan(few);
    expect(many).toBeCloseTo(4.7, 1);
  });

  it("scores an unrated recipe at the prior mean", () => {
    expect(bayesianScore({ average: 0, count: 0 })).toBe(TOP_RATED_PRIOR_MEAN);
  });
});

describe("compareByTopRated", () => {
  it("orders higher averages first when the counts match", () => {
    const rows = [
      { average: 3.2, count: 8 },
      { average: 4.8, count: 8 },
      { average: 4.0, count: 8 },
    ];
    expect(rows.sort(compareByTopRated).map((r) => r.average)).toEqual([
      4.8, 4.0, 3.2,
    ]);
  });

  it("does not let a lone 5-star outrank a well-reviewed 4.7", () => {
    const loneFiveStar = { average: 5, count: 1 };
    const favourite = { average: 4.7, count: 40 };
    // Count-aware ranking keeps the many-rating favourite on top.
    expect([loneFiveStar, favourite].sort(compareByTopRated)).toEqual([
      favourite,
      loneFiveStar,
    ]);
  });

  it("weights rating count so a well-reviewed 4.0 beats a two-rating 4.8", () => {
    const fewButHigh = { average: 4.8, count: 2 };
    const manyGood = { average: 4.0, count: 9 };
    expect([fewButHigh, manyGood].sort(compareByTopRated)).toEqual([
      manyGood,
      fewButHigh,
    ]);
  });

  it("breaks ties by rating count", () => {
    const rows = [
      { average: 4.5, count: 3 },
      { average: 4.5, count: 20 },
    ];
    expect(rows.sort(compareByTopRated).map((r) => r.count)).toEqual([20, 3]);
  });

  it("sorts unrated recipes last regardless of average", () => {
    const rows = [
      { average: 0, count: 0 },
      { average: 2.1, count: 4 },
    ];
    expect(rows.sort(compareByTopRated).map((r) => r.count)).toEqual([4, 0]);
  });
});

describe("parseRatingSort", () => {
  it("recognises the top-rated option", () => {
    expect(parseRatingSort("top-rated")).toBe("top-rated");
    expect(parseRatingSort(["top-rated", "recent"])).toBe("top-rated");
  });

  it("falls back to recent for anything else", () => {
    expect(parseRatingSort(undefined)).toBe("recent");
    expect(parseRatingSort("bogus")).toBe("recent");
    expect(parseRatingSort("")).toBe("recent");
  });
});
