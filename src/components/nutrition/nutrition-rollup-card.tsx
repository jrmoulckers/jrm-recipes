import { getTranslations } from 'next-intl/server';
import { AlertTriangle, Gauge } from 'lucide-react';

import { cn } from '~/lib/utils';
import { formatNutrient, nutritionRows } from '~/lib/nutrition';
import { averageRollUp, hasRollUp, type NutritionRollUp } from '~/lib/nutrition-rollup';
import { Badge } from '~/components/ui/badge';

/** How many named items are listed before a caveat line truncates. */
const MAX_NAMED = 6;

/**
 * Confidence bands. Deliberately coarse: the score is an estimate of an
 * estimate, and rendering it as a precise number in a precise colour would
 * overstate it in exactly the way this whole epic is about.
 */
function confidenceBand(confidence: number): 'success' | 'secondary' | 'warning' {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'secondary';
  return 'warning';
}

/** Join up to {@link MAX_NAMED} labels, appending "+N more" past that. */
function nameList(labels: readonly string[], more: (n: number) => string): string {
  const unique = [...new Set(labels)];
  if (unique.length <= MAX_NAMED) return unique.join(', ');
  return `${unique.slice(0, MAX_NAMED).join(', ')}, ${more(unique.length - MAX_NAMED)}`;
}

/**
 * A nutrition total for a set of meals — a planned week, a filtered cooking
 * journal — shown **with** the confidence behind it (#1048).
 *
 * The rule the card exists to keep: a figure is never rendered without the
 * evidence for it. So the confidence sits beside the total rather than in a
 * tooltip, the meals that contributed nothing are named, and the ingredient
 * lines that could not be weighed are named *with the meal they came from* —
 * which is the difference between a cook who can go and fix Tuesday's dinner and
 * one who is shown "76%" and can do nothing at all.
 *
 * A server component with no client JavaScript: the detail lives in a native
 * `<details>`, so the honesty costs the route no bundle.
 *
 * Renders nothing when no meal contributed nutrition, so callers can drop it in
 * unconditionally.
 */
export async function NutritionRollUpCard({
  rollUp,
  title,
  perLabel,
  perParts,
  className,
}: {
  rollUp: NutritionRollUp;
  /** Heading, e.g. "This week's nutrition". */
  title: string;
  /** Label for the secondary column, e.g. "per day". Omit to hide it. */
  perLabel?: string;
  /** Divisor for the secondary column, e.g. 7 for a week. */
  perParts?: number;
  className?: string;
}) {
  const t = await getTranslations('nutritionRollup');
  if (!hasRollUp(rollUp)) return null;

  const rows = nutritionRows(rollUp.total);
  if (rows.length === 0) return null;

  const showAverage = perLabel != null && perParts != null && perParts > 1;
  const averageByKey = new Map(
    (showAverage ? nutritionRows(averageRollUp(rollUp.total, perParts)) : []).map((row) => [
      row.key,
      row,
    ]),
  );

  const percent = Math.round(rollUp.confidence * 100);

  const unweighed = rollUp.unresolved.filter((line) => line.reason === 'weight');
  const unknownFoods = rollUp.unresolved.filter((line) => line.reason === 'facts');
  const more = (n: number) => t('andMore', { count: n });
  const placed = (line: { label: string; meal: string }) =>
    line.meal ? t('placedLine', { item: line.label, meal: line.meal }) : line.label;

  const hasCaveats =
    rollUp.missingMeals.length > 0 || unweighed.length > 0 || unknownFoods.length > 0;

  return (
    <section
      aria-label={title}
      className={cn('rounded-xl border border-border bg-surface/50 p-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <Badge variant={confidenceBand(rollUp.confidence)}>
          <Gauge className="size-3.5" aria-hidden="true" />
          {t('confidence', { percent })}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {t('acrossMeals', { counted: rollUp.countedMeals, total: rollUp.mealCount })}
      </p>

      <dl className="mt-3 flex flex-col">
        {rows.map((row, i) => {
          const average = averageByKey.get(row.key);
          return (
            <div
              key={row.key}
              className={cn(
                'flex items-baseline justify-between gap-3 py-1.5',
                i > 0 && 'border-t border-border/60',
                row.key === 'calories' && 'font-semibold',
              )}
            >
              <dt
                className={cn(
                  'text-sm',
                  row.key === 'calories' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {row.label}
              </dt>
              <dd className="flex items-baseline gap-3 text-sm tabular-nums">
                <span>
                  {formatNutrient(row.value, row.decimals)}
                  <span className="ms-1 text-muted-foreground">{row.unit}</span>
                </span>
                {showAverage && (
                  <span className="w-28 text-end text-xs font-normal text-muted-foreground">
                    {average
                      ? `${formatNutrient(average.value, average.decimals)} ${average.unit} ${perLabel}`
                      : '—'}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        {t('sourceMix', {
          entered: rollUp.sources.manual,
          estimated: rollUp.sources.graph + rollUp.sources.estimate,
        })}
      </p>

      {hasCaveats && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <AlertTriangle className="me-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            {t('whyUncertain')}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {rollUp.missingMeals.length > 0 && (
              <p>
                {t('missingMeals', {
                  items: nameList(
                    rollUp.missingMeals.map((meal) => meal.meal),
                    more,
                  ),
                })}
              </p>
            )}
            {unweighed.length > 0 && (
              <p>{t('couldNotWeigh', { items: nameList(unweighed.map(placed), more) })}</p>
            )}
            {unknownFoods.length > 0 && (
              <p>{t('noNutritionData', { items: nameList(unknownFoods.map(placed), more) })}</p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
