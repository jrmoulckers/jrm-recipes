import { type Metadata } from "next";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listWeekDinners } from "~/server/planner/queries";
import {
  formatMonthDay,
  formatWeekdayLong,
  formatWeekRange,
  getPlannerWeek,
  isToday,
  parseDateParam,
  toDateParam,
} from "~/server/planner/week";
import {
  buildWeekMenu,
  type WeekMenuDayInput,
  type WeekMenuEntry,
} from "~/lib/week-menu";
import { WeekMenuPrintView } from "~/components/print/week-menu-print-view";

export const metadata: Metadata = { title: "Print · Weekly menu" };

export default async function WeekMenuPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const focusDate = parseDateParam(week);
  const { start, end, days } = getPlannerWeek(focusDate);
  const startParam = toDateParam(start);
  const endParam = toDateParam(end);

  const user = await getCurrentUser();

  let entries: WeekMenuEntry[] = [];
  if (isDbConfigured() && user) {
    const rows = await listWeekDinners(user.id, startParam, endParam);
    entries = rows.map((row) => ({
      dateParam: row.date,
      note: row.note,
      recipe: row.recipe
        ? { title: row.recipe.title, totalMinutes: row.recipe.totalMinutes }
        : null,
    }));
  }

  const dayInputs: WeekMenuDayInput[] = days.map((day) => ({
    dateParam: toDateParam(day),
    weekday: formatWeekdayLong(day),
    date: formatMonthDay(day),
    isToday: isToday(day),
  }));

  return (
    <WeekMenuPrintView
      weekLabel={formatWeekRange(start, end)}
      days={buildWeekMenu(dayInputs, entries)}
      backHref={`/plan?week=${startParam}`}
    />
  );
}
