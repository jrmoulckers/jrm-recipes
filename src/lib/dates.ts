/**
 * Locale-aware date/time formatting on top of `date-fns`.
 *
 * App locales ({@link Locale}) are mapped to `date-fns` locale objects so every
 * formatted date, weekday, and relative-time phrase follows the active locale's
 * conventions — month/day order, translated names, and the "... ago" suffix —
 * instead of being hard-locked to US English. Week start is likewise derived
 * from the locale (`options.weekStartsOn`) rather than a hardcoded Sunday, so
 * the planner grid begins on the right day (Sunday for `en`, Monday for `es`/
 * `de`, Saturday for `ar`).
 *
 * Kept free of `server-only` so it can run in both server components and the
 * client planner grid. All helpers default to {@link DEFAULT_LOCALE} and fall
 * back to it for any unknown tag, so callers can adopt them incrementally
 * without changing English output.
 */
import {
  format,
  formatDistanceToNow,
  type Locale as DateFnsLocale,
} from "date-fns";
import { ar, de, enUS, es } from "date-fns/locale";

import { DEFAULT_LOCALE, type Locale } from "~/config/i18n";

/** Days of the week as `date-fns` numbers them (0 = Sunday … 6 = Saturday). */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DATE_FNS_LOCALES = {
  en: enUS,
  es,
  de,
  ar,
} satisfies Record<Locale, DateFnsLocale>;

/** The `date-fns` locale object for an app locale (default locale for unknowns). */
export function dateFnsLocale(locale: string = DEFAULT_LOCALE): DateFnsLocale {
  return DATE_FNS_LOCALES[locale as Locale] ?? DATE_FNS_LOCALES[DEFAULT_LOCALE];
}

/** The day a week starts on for a locale, straight from CLDR via `date-fns`. */
export function weekStartsOn(locale: string = DEFAULT_LOCALE): WeekStartsOn {
  return dateFnsLocale(locale).options?.weekStartsOn ?? 0;
}

/** Format a date with a `date-fns` pattern in the active locale. */
export function formatDate(
  date: Date,
  pattern: string,
  locale: string = DEFAULT_LOCALE,
): string {
  return format(date, pattern, { locale: dateFnsLocale(locale) });
}

/** Short weekday name, localized, e.g. "Sun" / "dom." / "Sa.". */
export function formatDayName(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return formatDate(date, "EEE", locale);
}

/** Day of month, localized numerals where the locale uses them. */
export function formatDayNumber(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return formatDate(date, "d", locale);
}

/** Full day label, localized, e.g. "Sunday, Jul 5". */
export function formatFullDay(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return formatDate(date, "EEEE, MMM d", locale);
}

/** Full weekday name, localized, e.g. "Sunday" / "domingo" / "Sonntag". */
export function formatWeekdayLong(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return formatDate(date, "EEEE", locale);
}

/** Month + day, localized, e.g. "Jul 5". */
export function formatMonthDay(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return formatDate(date, "MMM d", locale);
}

/**
 * Human-friendly week range, collapsing shared month/year — e.g.
 * "Jul 5 – 11, 2026" or "Jun 29 – Jul 5, 2026" — with localized month names.
 */
export function formatWeekRange(
  start: Date,
  end: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear && sameMonth) {
    return `${formatDate(start, "MMM d", locale)} – ${formatDate(end, "d, yyyy", locale)}`;
  }
  if (sameYear) {
    return `${formatDate(start, "MMM d", locale)} – ${formatDate(end, "MMM d, yyyy", locale)}`;
  }
  return `${formatDate(start, "MMM d, yyyy", locale)} – ${formatDate(end, "MMM d, yyyy", locale)}`;
}

/** Relative time with a localized suffix, e.g. "3 days ago" / "hace 3 días". */
export function formatRelativeTime(
  date: Date,
  locale: string = DEFAULT_LOCALE,
): string {
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: dateFnsLocale(locale),
  });
}
