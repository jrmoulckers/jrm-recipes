import "server-only";

import { listWeekDinners } from "./queries";
import {
  formatDayName,
  formatMonthDay,
  getPlannerWeek,
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
