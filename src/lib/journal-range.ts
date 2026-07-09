import { startOfMonth, startOfYear } from "date-fns";

/**
 * Pure time-range helpers for the cooking journal filters (#364). Kept free of
 * `server-only` and database imports so the client filter control and the
 * server page share one contract, and the range → since math can be unit
 * tested in isolation.
 */

/** Journal time-range options, in display order. */
export const JOURNAL_RANGES = ["month", "year", "all"] as const;
export type JournalRange = (typeof JOURNAL_RANGES)[number];

/** Human labels for each range, shown in the filter control. */
export const JOURNAL_RANGE_LABELS: Record<JournalRange, string> = {
  month: "This month",
  year: "This year",
  all: "All time",
};

/**
 * Coerce an untrusted query-param value to a valid range, defaulting to
 * "all" for anything missing or hand-edited.
 */
export function parseJournalRange(
  value: string | string[] | undefined | null,
): JournalRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "month" || raw === "year" ? raw : "all";
}

/**
 * The inclusive lower bound for a range, or `null` for "all time" (no bound).
 * `now` is injectable so the boundary is deterministic in tests.
 */
export function journalRangeSince(
  range: JournalRange,
  now: Date = new Date(),
): Date | null {
  switch (range) {
    case "month":
      return startOfMonth(now);
    case "year":
      return startOfYear(now);
    default:
      return null;
  }
}
