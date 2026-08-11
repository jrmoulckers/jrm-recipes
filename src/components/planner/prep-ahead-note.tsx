import Link from 'next/link';
import { AlarmClock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { PrepAheadReminder } from '~/lib/prep-ahead';

/**
 * "Tonight for tomorrow" nudge (issue #388). Renders nothing when there are no
 * reminders, so the plan page can drop it in unconditionally.
 */
export async function PrepAheadNote({ reminders }: { reminders: PrepAheadReminder[] }) {
  if (reminders.length === 0) return null;
  const t = await getTranslations('planner.prepAhead');
  return (
    <section
      aria-labelledby="prep-ahead-heading"
      className="rounded-xl border border-primary/25 bg-primary/5 p-4"
    >
      <div className="flex items-center gap-2 text-primary">
        <AlarmClock className="size-5" aria-hidden="true" />
        <h2
          id="prep-ahead-heading"
          className="font-display text-sm font-semibold uppercase tracking-wide"
        >
          {t('heading')}
        </h2>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {reminders.map((reminder) => (
          <li key={reminder.slug} className="text-[0.95rem]">
            <span className="font-semibold capitalize">{reminder.summary}</span> {t('forRecipe')}{' '}
            <Link
              href={`/recipes/${reminder.slug}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {reminder.title}
            </Link>{' '}
            <span className="text-muted-foreground">({reminder.dayLabel})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
