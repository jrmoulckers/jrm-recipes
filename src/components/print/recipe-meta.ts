import { useFormatter, useTranslations } from 'next-intl';

import { formatRecipeMeta } from '~/components/print/export';
import type { PrintRecipe } from '~/components/print/types';

export function useRecipeMeta(recipe: PrintRecipe): string[] {
  const t = useTranslations('print.meta');
  const td = useTranslations('recipeDetail');
  const format = useFormatter();

  return formatRecipeMeta(recipe, {
    time: (kind, minutes) => {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      const parts: string[] = [];
      if (hours > 0) {
        parts.push(format.number(hours, { style: 'unit', unit: 'hour', unitDisplay: 'short' }));
      }
      if (remainder > 0) {
        parts.push(
          format.number(remainder, { style: 'unit', unit: 'minute', unitDisplay: 'short' }),
        );
      }
      return t(kind, { time: parts.join(' ') });
    },
    difficulty: (value) => {
      if (value === 'easy' || value === 'medium' || value === 'hard') {
        return td(`difficulty.${value}`);
      }
      return value;
    },
  });
}
