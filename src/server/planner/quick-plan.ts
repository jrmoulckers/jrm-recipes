import "server-only";

import { listWeekDinners } from "./queries";
import {
  formatDayName,
  formatMonthDay,
  getPlannerWeek,
  nextWeekParam,
  parseDateParam,
  toDateParam,
  todayParam,
} from "./week";

/** One selectable day in the quick-plan picker (#379). */
export type QuickPlanDayOption = { value: string; label: string };

/** The current planner week plus the day to pre-select (next empty dinner). */
export type QuickPlanData = {
  days: QuickPlanDayOption[];
  defaultDate: string;
};

/**
 * Build the shared quick add-to-plan context: the seven days of the current
 * planner week (labelled "Mon, Jul 6") and the next empty dinner from today
 * onward to pre-select. Used by the browse grid (#379) and the home rails
 * (#375/#426) so a single click lands a recipe on a sensible night.
 */
export async function buildQuickPlanContext(
  userId: string,
): Promise<QuickPlanData> {
  const week = getPlannerWeek(new Date());
  const dinners = await listWeekDinners(userId, week.startParam, week.endParam);
  const occupied = new Set(dinners.map((entry) => entry.date));
  const days = week.days.map((day) => ({
    value: toDateParam(day),
    label: `${formatDayName(day)}, ${formatMonthDay(day)}`,
  }));
  const today = todayParam();
  const upcoming = days.filter((day) => day.value >= today);
  const pool = upcoming.length > 0 ? upcoming : days;
  const defaultDate =
    pool.find((day) => !occupied.has(day.value))?.value ??
    pool[0]?.value ??
    today;
  return { days, defaultDate };
}

/**
 * Build the add-to-plan context for the recipe detail page (#362): the current
 * planner week plus the following week (14 days, labelled "Mon, Jul 6"), with
 * today pre-selected. Signed-in detail-page viewers can drop a recipe onto any
 * night across two weeks without leaving the page, reusing `addEntryAction`.
 * Unlike {@link buildQuickPlanContext} this needs no occupancy read, so it is
 * synchronous.
 */
export function buildTwoWeekPlanContext(): QuickPlanData {
  const thisWeek = getPlannerWeek(new Date());
  const nextWeek = getPlannerWeek(parseDateParam(nextWeekParam(new Date())));
  const days = [...thisWeek.days, ...nextWeek.days].map((day) => ({
    value: toDateParam(day),
    label: `${formatDayName(day)}, ${formatMonthDay(day)}`,
  }));
  return { days, defaultDate: todayParam() };
}
