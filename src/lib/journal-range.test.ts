import { describe, expect, it } from "vitest";

import {
  journalRangeSince,
  parseJournalRange,
  JOURNAL_RANGES,
} from "./journal-range";

describe("parseJournalRange", () => {
  it("keeps the valid ranges", () => {
    expect(parseJournalRange("month")).toBe("month");
    expect(parseJournalRange("year")).toBe("year");
    expect(parseJournalRange("all")).toBe("all");
  });

  it("defaults unknown, missing, or hand-edited values to all", () => {
    expect(parseJournalRange(undefined)).toBe("all");
    expect(parseJournalRange(null)).toBe("all");
    expect(parseJournalRange("")).toBe("all");
    expect(parseJournalRange("week")).toBe("all");
  });

  it("takes the first value when a param repeats", () => {
    expect(parseJournalRange(["year", "month"])).toBe("year");
  });

  it("exposes the ranges in display order", () => {
    expect(JOURNAL_RANGES).toEqual(["month", "year", "all"]);
  });
});

describe("journalRangeSince", () => {
  const now = new Date("2026-07-08T13:45:00.000Z");

  it("returns the start of the month for the month range", () => {
    const since = journalRangeSince("month", now);
    expect(since).not.toBeNull();
    expect(since!.getFullYear()).toBe(2026);
    expect(since!.getMonth()).toBe(6); // July (0-indexed)
    expect(since!.getDate()).toBe(1);
  });

  it("returns the start of the year for the year range", () => {
    const since = journalRangeSince("year", now);
    expect(since).not.toBeNull();
    expect(since!.getFullYear()).toBe(2026);
    expect(since!.getMonth()).toBe(0);
    expect(since!.getDate()).toBe(1);
  });

  it("returns null for all time (no lower bound)", () => {
    expect(journalRangeSince("all", now)).toBeNull();
  });
});
