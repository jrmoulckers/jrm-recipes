import { describe, expect, it } from "vitest";

import {
  DAYS_IN_WEEK,
  formatDayName,
  formatDayNumber,
  formatFullDay,
  formatWeekRange,
  getPlannerWeek,
  isSameDate,
  isToday,
  nextWeekParam,
  parseDateParam,
  previousWeekParam,
  startOfPlannerWeek,
  toDateParam,
  todayParam,
} from "./week";

// July 6, 2026 is a Monday; the Sunday-start week runs Jul 5 – Jul 11.
const MON_JUL_6 = new Date(2026, 6, 6);
const THU_JUL_9 = new Date(2026, 6, 9);

describe("toDateParam / parseDateParam", () => {
  it("formats a date as yyyy-MM-dd", () => {
    expect(toDateParam(MON_JUL_6)).toBe("2026-07-06");
  });

  it("round-trips a valid date param", () => {
    expect(toDateParam(parseDateParam("2026-07-06"))).toBe("2026-07-06");
  });

  it("falls back to today for missing or malformed params", () => {
    const today = todayParam();
    expect(toDateParam(parseDateParam(undefined))).toBe(today);
    expect(toDateParam(parseDateParam(""))).toBe(today);
    expect(toDateParam(parseDateParam("not-a-date"))).toBe(today);
    expect(toDateParam(parseDateParam("2026-13-40"))).toBe(today);
  });
});

describe("startOfPlannerWeek", () => {
  it("snaps any weekday back to the preceding Sunday", () => {
    expect(startOfPlannerWeek(MON_JUL_6).getDay()).toBe(0);
    expect(toDateParam(startOfPlannerWeek(MON_JUL_6))).toBe("2026-07-05");
    expect(toDateParam(startOfPlannerWeek(THU_JUL_9))).toBe("2026-07-05");
  });
});

describe("getPlannerWeek", () => {
  it("returns seven consecutive days from Sunday to Saturday", () => {
    const week = getPlannerWeek(MON_JUL_6);
    expect(week.days).toHaveLength(DAYS_IN_WEEK);
    expect(week.startParam).toBe("2026-07-05");
    expect(week.endParam).toBe("2026-07-11");
    expect(week.days[0]!.getDay()).toBe(0);
    expect(week.days[6]!.getDay()).toBe(6);
    expect(toDateParam(week.days[0]!)).toBe("2026-07-05");
    expect(toDateParam(week.days[6]!)).toBe("2026-07-11");
  });
});

describe("week navigation", () => {
  it("moves to the start of the next and previous week", () => {
    expect(nextWeekParam(MON_JUL_6)).toBe("2026-07-12");
    expect(previousWeekParam(MON_JUL_6)).toBe("2026-06-28");
  });
});

describe("formatWeekRange", () => {
  it("collapses a same-month range", () => {
    expect(formatWeekRange(new Date(2026, 6, 5), new Date(2026, 6, 11))).toBe(
      "Jul 5 – 11, 2026",
    );
  });

  it("spells out a cross-month range", () => {
    expect(formatWeekRange(new Date(2026, 5, 29), new Date(2026, 6, 5))).toBe(
      "Jun 29 – Jul 5, 2026",
    );
  });

  it("spells out a cross-year range", () => {
    expect(formatWeekRange(new Date(2025, 11, 28), new Date(2026, 0, 3))).toBe(
      "Dec 28, 2025 – Jan 3, 2026",
    );
  });
});

describe("day formatting", () => {
  it("formats weekday, day number and full label", () => {
    const sunday = new Date(2026, 6, 5);
    expect(formatDayName(sunday)).toBe("Sun");
    expect(formatDayNumber(sunday)).toBe("5");
    expect(formatFullDay(sunday)).toBe("Sunday, Jul 5");
  });
});

describe("isSameDate / isToday", () => {
  it("compares calendar days ignoring time", () => {
    expect(
      isSameDate(new Date(2026, 6, 6, 8, 30), new Date(2026, 6, 6, 21, 15)),
    ).toBe(true);
    expect(isSameDate(new Date(2026, 6, 6), new Date(2026, 6, 7))).toBe(false);
  });

  it("recognizes today", () => {
    expect(isToday(new Date())).toBe(true);
    expect(isToday(new Date(2000, 0, 1))).toBe(false);
  });
});
