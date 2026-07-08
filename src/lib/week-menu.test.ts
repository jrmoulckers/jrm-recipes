import { describe, expect, it } from "vitest";

import { formatLeftoversNote } from "./planner-batch";
import {
  buildWeekMenu,
  formatCookTime,
  type WeekMenuDayInput,
  type WeekMenuEntry,
} from "./week-menu";

const days: WeekMenuDayInput[] = [
  { dateParam: "2026-07-06", weekday: "Monday", date: "Jul 6", isToday: true },
  { dateParam: "2026-07-07", weekday: "Tuesday", date: "Jul 7", isToday: false },
  {
    dateParam: "2026-07-08",
    weekday: "Wednesday",
    date: "Jul 8",
    isToday: false,
  },
];

describe("formatCookTime (#438)", () => {
  it("formats minutes and hours, and drops empty values", () => {
    expect(formatCookTime(null)).toBeNull();
    expect(formatCookTime(0)).toBeNull();
    expect(formatCookTime(45)).toBe("45 min");
    expect(formatCookTime(60)).toBe("1 hr");
    expect(formatCookTime(90)).toBe("1 hr 30 min");
  });
});

describe("buildWeekMenu (#438)", () => {
  it("maps recipes, leftovers, notes, and empty days", () => {
    const entries: WeekMenuEntry[] = [
      {
        dateParam: "2026-07-06",
        note: null,
        recipe: { title: "Weeknight Chili", totalMinutes: 45 },
      },
      {
        dateParam: "2026-07-08",
        note: formatLeftoversNote("Weeknight Chili", 2),
        recipe: { title: "Weeknight Chili", totalMinutes: 45 },
      },
      { dateParam: "2026-07-07", note: "Order pizza", recipe: null },
    ];

    const menu = buildWeekMenu(days, entries);

    expect(menu[0]!.dinners).toEqual([
      { title: "Weeknight Chili", timeLabel: "45 min", leftovers: false },
    ]);
    expect(menu[1]!.dinners).toEqual([
      { title: "Order pizza", timeLabel: null, leftovers: false },
    ]);
    expect(menu[2]!.dinners).toEqual([
      { title: "Leftovers: Weeknight Chili", timeLabel: null, leftovers: true },
    ]);
  });

  it("returns an empty dinner list for unplanned days", () => {
    const menu = buildWeekMenu(days, []);
    expect(menu).toHaveLength(3);
    expect(menu.every((day) => day.dinners.length === 0)).toBe(true);
  });

  it("keeps multiple dinners planned on the same day", () => {
    const entries: WeekMenuEntry[] = [
      {
        dateParam: "2026-07-06",
        note: null,
        recipe: { title: "Soup", totalMinutes: null },
      },
      {
        dateParam: "2026-07-06",
        note: null,
        recipe: { title: "Salad", totalMinutes: 10 },
      },
    ];
    const menu = buildWeekMenu(days, entries);
    expect(menu[0]!.dinners.map((d) => d.title)).toEqual(["Soup", "Salad"]);
    expect(menu[0]!.dinners[0]!.timeLabel).toBeNull();
  });
});
