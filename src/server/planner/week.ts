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

import { DEFAULT_LOCALE } from "~/config/i18n";
import { weekStartsOn } from "~/lib/dates";

export const DAYS_IN_WEEK = 7;

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

/** Shift a `yyyy-MM-dd` param by a number of days (used to copy a week, #434). */
export function addDaysToParam(param: string, days: number): string {
  return toDateParam(addDays(parseDateParam(param), days));
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

/**
 * The first day of the planner week containing `date`. Which weekday that is
 * comes from the locale (Sunday for `en`, Monday for `es`/`de`, …), defaulting
 * to English so existing callers keep their Sunday-start grid.
 */
export function startOfPlannerWeek(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): Date {
  return startOfWeek(date, { weekStartsOn: weekStartsOn(locale) });
}

export type PlannerWeek = {
  start: Date;
  end: Date;
  days: Date[];
  startParam: string;
  endParam: string;
};

/** The 7-day week (start, end, each day, and query params) containing `date`. */
export function getPlannerWeek(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): PlannerWeek {
  const start = startOfPlannerWeek(date, locale);
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
export function nextWeekParam(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return toDateParam(startOfPlannerWeek(addWeeks(date, 1), locale));
}

/** `yyyy-MM-dd` for the start of the week before the one containing `date`. */
export function previousWeekParam(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return toDateParam(startOfPlannerWeek(subWeeks(date, 1), locale));
}

/** True when the two dates fall on the same calendar day. */
export function isSameDate(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

/** True when `date` is today. */
export function isToday(date: Date): boolean {
  return dateFnsIsToday(date);
}

/**
 * Locale-aware display formatters live in {@link ~/lib/dates}; re-exported here
 * so planner callers have one import. Each defaults to English, so existing
 * (locale-less) call sites and snapshots are unaffected. `formatWeekdayLong`
 * and `formatMonthDay` back the printable week menu (#438).
 */
export {
  formatWeekRange,
  formatDayName,
  formatDayNumber,
  formatFullDay,
  formatWeekdayLong,
  formatMonthDay,
} from "~/lib/dates";
