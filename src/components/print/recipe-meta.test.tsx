import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { KeepsakeView } from '~/components/recipe/keepsake-view';
import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
import { IntlWrapper } from '~/test/intl';
import {
  formatRecipeMeta,
  recipeUrl,
  serializeRecipeMarkdown,
  serializeRecipePlainText,
} from './export';
import { PrintView } from './print-view';
import { useRecipeMeta } from './recipe-meta';
import { RecipePrintBody } from './recipe-print-body';
import type { PrintRecipe } from './types';

afterEach(cleanup);

const recipe: PrintRecipe = {
  id: 'localized-meta',
  slug: 'localized-meta',
  title: 'Family pasta',
  description: 'Our handwritten recipe.',
  coverImageUrl: null,
  coverImageAlt: null,
  visibility: 'public',
  servings: 4,
  servingsNoun: 'servings',
  totalMinutes: 30,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: 'medium',
  cuisines: ['Italian'],
  cuisine: 'legacy cuisine',
  sourceName: null,
  sourceUrl: null,
  notes: null,
  author: null,
  ingredients: [],
  steps: [],
  tags: [],
};

const locales = [
  { locale: 'en', messages: en, labels: ['Total', 'Prep', 'Cook'], medium: 'Medium' },
  {
    locale: 'es',
    messages: es,
    labels: ['Tiempo total', 'Preparación', 'Cocción'],
    medium: 'Media',
  },
  { locale: 'de', messages: de, labels: ['Gesamt', 'Vorbereitung', 'Garzeit'], medium: 'Mittel' },
  { locale: 'ar', messages: ar, labels: ['الإجمالي', 'التحضير', 'الطهي'], medium: 'متوسطة' },
] as const;

describe.each(locales)(
  'recipe metadata in $locale (#1206)',
  ({ locale, messages, labels, medium }) => {
    function wrapper({ children }: { children: React.ReactNode }) {
      return (
        <IntlWrapper locale={locale} messages={messages}>
          {children}
        </IntlWrapper>
      );
    }

    it('localizes generated metadata while preserving authored nouns and cuisines', () => {
      const { result } = renderHook(() => useRecipeMeta(recipe), { wrapper });
      expect(result.current).toHaveLength(6);
      expect(result.current[0]).toBe('4 servings');
      for (const [index, label] of labels.entries()) {
        expect(result.current[index + 1]).toMatch(new RegExp(`^${label} `));
      }
      expect(result.current.slice(4)).toEqual([medium, 'Italian']);
    });

    it.each(['easy', 'medium', 'hard', null] as const)('handles difficulty %s', (difficulty) => {
      const { result } = renderHook(
        () =>
          useRecipeMeta({
            ...recipe,
            servings: null,
            totalMinutes: null,
            prepMinutes: null,
            cookMinutes: null,
            cuisine: null,
            cuisines: [],
            difficulty,
          }),
        { wrapper },
      );
      expect(result.current).toEqual(
        difficulty ? [messages.recipeDetail.difficulty[difficulty]] : [],
      );
    });

    it.each([null, 0, -1])('omits optional times equal to %s', (minutes) => {
      const { result } = renderHook(
        () =>
          useRecipeMeta({
            ...recipe,
            totalMinutes: minutes,
            prepMinutes: minutes,
            cookMinutes: minutes,
          }),
        { wrapper },
      );
      expect(result.current).toEqual(['4 servings', medium, 'Italian']);
    });

    it('preserves the fallback noun and custom metadata byte-for-byte', () => {
      const { result, rerender } = renderHook(({ current }) => useRecipeMeta(current), {
        wrapper,
        initialProps: {
          current: {
            ...recipe,
            servingsNoun: null,
            difficulty: 'family Favourite',
            cuisines: ['Italian', 'Nonna’s kitchen'],
          },
        },
      });
      expect(result.current[0]).toBe('4 servings');
      expect(result.current.slice(4)).toEqual(['family Favourite', 'Italian, Nonna’s kitchen']);
      rerender({
        current: {
          ...recipe,
          servingsNoun: null,
          difficulty: 'family Favourite',
          cuisines: [],
        },
      });
      expect(result.current.at(-1)).toBe('legacy cuisine');
    });

    it('wires the same presentation into keepsake, cookbook body, full-page and card layouts', () => {
      const { result, unmount } = renderHook(() => useRecipeMeta(recipe), { wrapper });
      const meta = result.current;
      unmount();
      for (const component of [
        <KeepsakeView key="keepsake" recipe={recipe} from={null} note={null} />,
        <RecipePrintBody key="body" recipe={recipe} />,
      ]) {
        const view = render(component, { wrapper });
        expect(screen.getByText(meta.join(' · '))).toBeInTheDocument();
        expect(screen.getByText(recipe.title)).toBeInTheDocument();
        expect(screen.getByText(recipe.description!)).toBeInTheDocument();
        view.unmount();
      }
      const view = render(<PrintView recipe={recipe} />, { wrapper });
      for (const format of ['full', 'compact', 'card4x6', 'card3x5'] as const) {
        fireEvent.click(
          screen.getByRole('button', {
            name: messages.print.formats[format].label,
          }),
        );
        const document = view.container.querySelector('.heirloom-print-document')!;
        for (const value of meta) expect(document.textContent).toContain(value);
        expect(document.textContent).toContain(recipe.title);
      }
    });

    it('does not change text or Markdown exports under a localized provider', () => {
      const meta = '4 servings · Total 30 min · Prep 10 min · Cook 20 min · Medium · Italian';
      const { result } = renderHook(
        () => {
          useRecipeMeta(recipe);
          return {
            text: serializeRecipePlainText(recipe),
            markdown: serializeRecipeMarkdown(recipe),
          };
        },
        { wrapper },
      );
      expect(result.current.text).toBe(
        [
          'Family pasta',
          '============',
          '',
          'Our handwritten recipe.',
          '',
          meta,
          '',
          'Ingredients',
          '- No ingredients listed.',
          '',
          'Method',
          'No steps listed.',
          '',
          recipeUrl(recipe),
          '',
        ].join('\n'),
      );
      expect(result.current.markdown).toBe(
        [
          '# Family pasta',
          '',
          '_Our handwritten recipe._',
          '',
          `**Meta:** ${meta}`,
          '',
          '## Ingredients',
          '- No ingredients listed.',
          '',
          '## Method',
          'No steps listed.',
          '',
          `[Open recipe](${recipeUrl(recipe)})`,
          '',
        ].join('\n'),
      );
      expect(formatRecipeMeta({ ...recipe, totalMinutes: 90 })[1]).toBe('Total 1 hr 30 min');
    });
  },
);

it('formats German hours and minutes rather than English duration units (#1206)', () => {
  const { result } = renderHook(
    () => useRecipeMeta({ ...recipe, totalMinutes: 90, prepMinutes: 60, cookMinutes: 30 }),
    {
      wrapper: ({ children }) => (
        <IntlWrapper locale="de" messages={de}>
          {children}
        </IntlWrapper>
      ),
    },
  );
  expect(result.current.slice(1, 4)).toEqual([
    'Gesamt 1 Std. 30 Min.',
    'Vorbereitung 1 Std.',
    'Garzeit 30 Min.',
  ]);
});
