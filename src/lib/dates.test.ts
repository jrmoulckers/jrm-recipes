import { describe, expect, it } from "vitest";

import {
  dateFnsLocale,
  formatDayName,
  formatRelativeTime,
  formatWeekRange,
  weekStartsOn,
} from "./dates";

const SUNDAY = new Date(2026, 6, 5);
const WEEK_START = new Date(2026, 6, 5);
const WEEK_END = new Date(2026, 6, 11);

describe("weekStartsOn", () => {
  it("derives the first weekday from the locale, not a hardcoded Sunday", () => {
    expect(weekStartsOn("en")).toBe(0); // Sunday
    expect(weekStartsOn("es")).toBe(1); // Monday
    expect(weekStartsOn("de")).toBe(1); // Monday
    expect(weekStartsOn("ar")).toBe(6); // Saturday
  });

  it("falls back to the default locale for an unknown tag", () => {
    expect(weekStartsOn("xx")).toBe(0);
  });
});

describe("dateFnsLocale", () => {
  it("falls back to English for an unknown tag instead of returning undefined", () => {
    expect(dateFnsLocale("xx").code).toBe(dateFnsLocale("en").code);
  });
});

describe("formatDayName", () => {
  it("translates the weekday per locale", () => {
    expect(formatDayName(SUNDAY, "en")).toBe("Sun");
    expect(formatDayName(SUNDAY, "es")).toBe("dom");
    expect(formatDayName(SUNDAY, "de")).toBe("So.");
  });

  it("defaults to English", () => {
    expect(formatDayName(SUNDAY)).toBe("Sun");
  });
});

describe("formatWeekRange", () => {
  it("localizes month names in a same-month range", () => {
    expect(formatWeekRange(WEEK_START, WEEK_END, "en")).toBe("Jul 5 – 11, 2026");
    expect(formatWeekRange(WEEK_START, WEEK_END, "es")).toBe("jul 5 – 11, 2026");
    expect(formatWeekRange(WEEK_START, WEEK_END, "de")).toBe(
      "Juli 5 – 11, 2026",
    );
  });
});

describe("formatRelativeTime", () => {
  it("uses the locale's relative-time phrasing", () => {
    const longAgo = new Date(2000, 0, 1);
    expect(formatRelativeTime(longAgo, "en")).toMatch(/ago$/);
    expect(formatRelativeTime(longAgo, "es")).toMatch(/^hace/);
  });
});
