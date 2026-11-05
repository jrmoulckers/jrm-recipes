import { useTranslations } from 'next-intl';

import type { Allergen } from './allergens';

/** Presentation only; detection and non-UI contracts retain their domain labels. */
export function useAllergenLabels(): Readonly<Record<Allergen, string>> {
  const t = useTranslations('common.allergenNames');
  return {
    peanut: t('peanut'),
    'tree-nut': t('tree-nut'),
    dairy: t('dairy'),
    egg: t('egg'),
    soy: t('soy'),
    wheat: t('wheat'),
    fish: t('fish'),
    shellfish: t('shellfish'),
    sesame: t('sesame'),
  };
}
