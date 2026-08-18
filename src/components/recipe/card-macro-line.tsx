import { useTranslations } from 'next-intl';

import { type MacroNutrientKey } from '~/server/recipes/search';
import { type MacroCardSummary } from '~/server/recipes/macro-search';

/**
 * The per-serving figures behind a macro-filtered result, shown with the
 * provenance that makes them readable (#1047).
 *
 * A number on a filtered card is the most likely thing in the product to be
 * read as fact: the viewer asked for "at least 30 g protein" and is looking at
 * the answer, with no ingredient list in front of them to check it against. So
 * the figure never appears alone — every card that shows one also says where it
 * came from, and a derived figure says how sure the system is.
 *
 * `uncertain` marks the figures that are only on screen because the viewer
 * opted into seeing withheld results. They must not read like the rest.
 */
export function CardMacroLine({
  macro,
  nutrients,
}: {
  macro: MacroCardSummary;
  nutrients: MacroNutrientKey[];
}) {
  const t = useTranslations('recipe');
  const parts = nutrients
    .map((key) => ({ key, value: macro.perServing[key] }))
    .filter((p): p is { key: MacroNutrientKey; value: number } => p.value != null);
  if (parts.length === 0) return null;

  return (
    <p
      className={
        macro.uncertain
          ? 'text-xs text-amber-700 dark:text-amber-500'
          : 'text-xs text-muted-foreground'
      }
    >
      <span className="font-medium tabular-nums text-foreground/80">
        {parts
          .map(({ key, value }) => t(`recipeCard.macroValue.${key}`, { value: Math.round(value) }))
          .join(' · ')}
      </span>{' '}
      <span>
        {macro.source === 'manual'
          ? t('recipeCard.macroManual')
          : t('recipeCard.macroEstimated', {
              percent: Math.round((macro.confidence ?? 0) * 100),
            })}
      </span>
      {macro.uncertain && <> · {t('recipeCard.macroUncertain')}</>}
    </p>
  );
}
