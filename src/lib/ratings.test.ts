import { describe, expect, it } from "vitest";

import {
  compareByTopRated,
  filledStars,
  parseRatingSort,
  ratingDisplay,
  ratingSummary,
} from "./ratings";

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

describe("compareByTopRated", () => {
  it("orders higher averages first", () => {
    const rows = [
      { average: 3.2, count: 5 },
      { average: 4.8, count: 2 },
      { average: 4.0, count: 9 },
    ];
    expect(rows.sort(compareByTopRated).map((r) => r.average)).toEqual([
      4.8, 4.0, 3.2,
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
