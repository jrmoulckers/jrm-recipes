import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES, type Locale } from '~/config/i18n';
import { namespacesForPathname, pickMessages } from '~/i18n/messages';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
import de from '~/messages/de.json';
import ar from '~/messages/ar.json';
import { IntlWrapper } from '~/test/intl';
import { ALLERGENS, ALLERGEN_LABELS } from './allergens';
import { useAllergenLabels } from './allergen-labels';

afterEach(cleanup);

const catalogs = { en, es, de, ar } satisfies Record<Locale, typeof en>;
const expected = {
  en: [
    'Peanuts',
    'Tree nuts',
    'Dairy',
    'Eggs',
    'Soy',
    'Wheat/gluten',
    'Fish',
    'Shellfish',
    'Sesame',
  ],
  es: [
    'Cacahuetes',
    'Frutos de cáscara',
    'Lácteos',
    'Huevos',
    'Soja',
    'Trigo/gluten',
    'Pescado',
    'Mariscos',
    'Sésamo',
  ],
  de: [
    'Erdnüsse',
    'Schalenfrüchte',
    'Milchprodukte',
    'Eier',
    'Soja',
    'Weizen/Gluten',
    'Fisch',
    'Krebstiere und Weichtiere',
    'Sesam',
  ],
  ar: [
    'الفول السوداني',
    'المكسرات الشجرية',
    'منتجات الألبان',
    'البيض',
    'الصويا',
    'القمح/الغلوتين',
    'السمك',
    'القشريات والرخويات',
    'السمسم',
  ],
} satisfies Record<Locale, string[]>;

describe('useAllergenLabels', () => {
  it.each(SUPPORTED_LOCALES)(
    'covers every stable allergen ID in %s without changing enum order',
    (locale) => {
      const { result } = renderHook(useAllergenLabels, {
        wrapper: ({ children }) => (
          <IntlWrapper locale={locale} messages={catalogs[locale]}>
            {children}
          </IntlWrapper>
        ),
      });

      expect(Object.keys(catalogs[locale].common.allergenNames)).toEqual([...ALLERGENS]);
      expect(Object.keys(result.current)).toEqual([...ALLERGENS]);
      expect(ALLERGENS.map((id) => result.current[id])).toEqual(expected[locale]);
    },
  );

  it('preserves the English domain fallback labels', () => {
    const { result } = renderHook(useAllergenLabels, { wrapper: IntlWrapper });
    expect(result.current).toEqual(ALLERGEN_LABELS);
  });

  it.each(['/recipes/ada/pie', '/recipes/ada/pie/cook', '/settings/dietary', '/plan', '/shopping'])(
    'includes German names in route-scoped messages on %s',
    (pathname) => {
      const namespaces = namespacesForPathname(pathname);
      expect(namespaces).not.toBeNull();
      const messages = pickMessages(de, namespaces);
      expect(messages).toHaveProperty('common.allergenNames', de.common.allergenNames);
    },
  );
});
