import { type Metadata } from "next";
import { getLocale } from "next-intl/server";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listViewerGroups, listWeekDinners } from "~/server/planner/queries";
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

export const metadata: Metadata = {
  title: "Print · Weekly menu",
  robots: { index: false, follow: false },
};

export default async function WeekMenuPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; scope?: string }>;
}) {
  const { week, scope } = await searchParams;
  const locale = await getLocale();
  const focusDate = parseDateParam(week);
  const { start, end, days } = getPlannerWeek(focusDate, locale);
  const startParam = toDateParam(start);
  const endParam = toDateParam(end);

  const user = await getCurrentUser();

  let entries: WeekMenuEntry[] = [];
  let activeGroupSlug: string | null = null;
  if (isDbConfigured() && user) {
    const viewerGroups = scope ? await listViewerGroups(user.id) : [];
    const activeGroup =
      scope != null
        ? (viewerGroups.find((group) => group.slug === scope) ?? null)
        : null;
    activeGroupSlug = activeGroup?.slug ?? null;
    const rows = await listWeekDinners(
      user.id,
      startParam,
      endParam,
      activeGroup?.id,
    );
    entries = rows.map((row) => ({
      dateParam: row.date,
      note: row.note,
      leftoverSourceId: row.leftoverSourceId,
      recipe: row.recipe
        ? { title: row.recipe.title, totalMinutes: row.recipe.totalMinutes }
        : null,
    }));
  }

  const dayInputs: WeekMenuDayInput[] = days.map((day) => ({
    dateParam: toDateParam(day),
    weekday: formatWeekdayLong(day, locale),
    date: formatMonthDay(day, locale),
    isToday: isToday(day),
  }));

  return (
    <WeekMenuPrintView
      weekLabel={formatWeekRange(start, end, locale)}
      days={buildWeekMenu(dayInputs, entries)}
      backHref={
        activeGroupSlug
          ? `/plan?scope=${activeGroupSlug}&week=${startParam}`
          : `/plan?week=${startParam}`
      }
    />
  );
}
