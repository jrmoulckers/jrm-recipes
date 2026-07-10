import { parseLeftoversNote } from "./planner-batch";

/**
 * Shapes and pure logic for the printable "week menu" fridge sheet (#438).
 * Kept database- and React-free so it can be unit tested and shared between the
 * server page (which loads the entries) and the print view (which renders them).
 */

export type WeekMenuDinner = {
  title: string;
  timeLabel: string | null;
  leftovers: boolean;
};

export type WeekMenuDayInput = {
  dateParam: string;
  weekday: string;
  date: string;
  isToday: boolean;
};

export type WeekMenuEntry = {
  dateParam: string;
  note: string | null;
  recipe: { title: string; totalMinutes: number | null } | null;
};

export type WeekMenuDay = WeekMenuDayInput & { dinners: WeekMenuDinner[] };

/** Render minutes as a glanceable label, e.g. "45 min" or "1 hr 30 min". */
export function formatCookTime(
  totalMinutes: number | null | undefined,
): string | null {
  if (totalMinutes == null || totalMinutes <= 0) return null;
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/**
 * Fold dinner entries into one row per day. Recipes show their total time,
 * leftovers nights are labelled and flagged (no time), and free-form notes
 * (e.g. "Order pizza") pass through as-is. Days with nothing planned come back
 * with an empty `dinners` array so the sheet can show a graceful placeholder.
 */
export function buildWeekMenu(
  days: WeekMenuDayInput[],
  entries: WeekMenuEntry[],
): WeekMenuDay[] {
  const byDate = new Map<string, WeekMenuDinner[]>();
  for (const entry of entries) {
    const leftovers = entry.recipe ? parseLeftoversNote(entry.note) : null;
    let dinner: WeekMenuDinner | null = null;
    if (leftovers) {
      dinner = {
        title: `Leftovers: ${leftovers.title}`,
        timeLabel: null,
        leftovers: true,
      };
    } else if (entry.recipe) {
      dinner = {
        title: entry.recipe.title,
        timeLabel: formatCookTime(entry.recipe.totalMinutes),
        leftovers: false,
      };
    } else if (entry.note?.trim()) {
      dinner = { title: entry.note.trim(), timeLabel: null, leftovers: false };
    }
    if (!dinner) continue;
    const list = byDate.get(entry.dateParam);
    if (list) list.push(dinner);
    else byDate.set(entry.dateParam, [dinner]);
  }
  return days.map((day) => ({
    ...day,
    dinners: byDate.get(day.dateParam) ?? [],
  }));
}
