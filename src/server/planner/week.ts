/**
 * Pure date helpers for the weekly meal planner. Kept free of `server-only` and
 * database imports so they can run on the client (the week grid) and be unit
 * tested in isolation. All formatting is done in local time and calendar dates
 * are round-tripped as `yyyy-MM-dd` strings to match the Postgres `date` column,
 * so a plan never drifts across timezones.
 */
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  isToday as dateFnsIsToday,
  isValid,
  parse,
  startOfWeek,
  subWeeks,
} from "date-fns";

export const DAYS_IN_WEEK = 7;

/** Planner weeks start on Sunday to match the default calendar grid. */
export const WEEK_STARTS_ON = 0;

const DATE_PARAM_FORMAT = "yyyy-MM-dd";

/** Format a date as the `yyyy-MM-dd` string used in URLs and the `date` column. */
export function toDateParam(date: Date): string {
  return format(date, DATE_PARAM_FORMAT);
}

/** Today as a `yyyy-MM-dd` string. */
export function todayParam(): string {
  return toDateParam(new Date());
}

/** Tomorrow as a `yyyy-MM-dd` string — used by the prep-ahead nudge (#388). */
export function tomorrowParam(): string {
  return toDateParam(addDays(new Date(), 1));
}

/**
 * Parse a `yyyy-MM-dd` string into a local Date, falling back to today when the
 * value is missing or malformed (e.g. a hand-edited URL).
 */
export function parseDateParam(param?: string | null): Date {
  if (!param) return new Date();
  const parsed = parse(param, DATE_PARAM_FORMAT, new Date());
  return isValid(parsed) ? parsed : new Date();
}

/** The first day (Sunday) of the planner week containing `date`. */
export function startOfPlannerWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
}

export type PlannerWeek = {
  start: Date;
  end: Date;
  days: Date[];
  startParam: string;
  endParam: string;
};

/** The 7-day week (start, end, each day, and query params) containing `date`. */
export function getPlannerWeek(date: Date): PlannerWeek {
  const start = startOfPlannerWeek(date);
  const days = Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    addDays(start, index),
  );
  const end = days[DAYS_IN_WEEK - 1]!;
  return {
    start,
    end,
    days,
    startParam: toDateParam(start),
    endParam: toDateParam(end),
  };
}

/** `yyyy-MM-dd` for the start of the week after the one containing `date`. */
export function nextWeekParam(date: Date): string {
  return toDateParam(startOfPlannerWeek(addWeeks(date, 1)));
}

/** `yyyy-MM-dd` for the start of the week before the one containing `date`. */
export function previousWeekParam(date: Date): string {
  return toDateParam(startOfPlannerWeek(subWeeks(date, 1)));
}

/** True when the two dates fall on the same calendar day. */
export function isSameDate(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

/** True when `date` is today. */
export function isToday(date: Date): boolean {
  return dateFnsIsToday(date);
}

/** Human-friendly week range, e.g. "Jul 6 – 12, 2026" or "Jun 29 – Jul 5, 2026". */
export function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear && sameMonth) {
    return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
  }
  if (sameYear) {
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
}

/** Short weekday name, e.g. "Sun". */
export function formatDayName(date: Date): string {
  return format(date, "EEE");
}

/** Day of month, e.g. "6". */
export function formatDayNumber(date: Date): string {
  return format(date, "d");
}

/** Full day label, e.g. "Sunday, Jul 6". */
export function formatFullDay(date: Date): string {
  return format(date, "EEEE, MMM d");
}
