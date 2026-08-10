'use client';

import { useTranslations } from 'next-intl';

import type { ShoppingCategory } from '~/lib/shopping-list';

export function useShoppingCategoryLabels(): Readonly<Record<ShoppingCategory, string>> {
  const t = useTranslations('shopping.export.categories');
  return {
    Produce: t('produce'),
    Pantry: t('pantry'),
    'Dairy & Eggs': t('dairy'),
    'Meat & Seafood': t('meat'),
    Bakery: t('bakery'),
    'Spices & Seasonings': t('spices'),
    Frozen: t('frozen'),
    Beverages: t('beverages'),
    Other: t('other'),
  };
}
