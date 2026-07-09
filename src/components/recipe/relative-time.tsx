"use client";

import { useLocale } from "next-intl";

import { formatRelativeTime } from "~/lib/dates";

/**
 * A locale-aware relative timestamp (e.g. "3 days ago" / "hace 3 días"),
 * rendered on the client so it follows the viewer's locale and timezone rather
 * than the server's. Lets an otherwise-server component (like the recipe story
 * timeline) show a properly localized "... ago" without going client itself.
 *
 * `suppressHydrationWarning` absorbs the expected server/client text difference
 * as the wall clock advances between render and hydration.
 */
export function RelativeTime({
  value,
  className,
}: {
  value: Date;
  className?: string;
}) {
  const locale = useLocale();
  return (
    <time
      dateTime={value.toISOString()}
      suppressHydrationWarning
      className={className}
    >
      {formatRelativeTime(value, locale)}
    </time>
  );
}
