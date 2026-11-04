import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { diffRecipeSnapshots } from '~/lib/recipe-diff';
import enMessages from '~/messages/en.json';
import esMessages from '~/messages/es.json';
import deMessages from '~/messages/de.json';
import arMessages from '~/messages/ar.json';
import { compareRecipeVersionsAction } from '~/server/recipes/actions';
import type { RecipeInput } from '~/server/recipes/validation';
import { IntlWrapper } from '~/test/intl';
import { VersionCompare } from './version-compare';

vi.mock('~/server/recipes/actions', () => ({
  compareRecipeVersionsAction: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const before: RecipeInput = {
  title: 'Family pasta',
  description: 'Original family description',
  servings: 4,
  servingsNoun: 'bowls',
  prepMinutes: 10,
  cookMinutes: 20,
  totalMinutes: 30,
  restMinutes: 0,
  difficulty: 'easy',
  cuisine: 'Italian',
  cuisines: ['Italian'],
  mealTypes: ['Dinner'],
  notes: 'Original family notes',
  ingredients: [],
  steps: [],
  sourceImages: [],
  tags: [],
  equipment: [],
  dietaryFlags: [],
  visibility: 'public',
  status: 'published',
};

const after: RecipeInput = {
  ...before,
  title: 'Family pasta with herbs',
  description: 'Updated family description',
  servings: 8,
  servingsNoun: 'plates',
  prepMinutes: 15,
  cookMinutes: 25,
  totalMinutes: 45,
  restMinutes: 5,
  difficulty: 'medium',
  cuisine: 'Mediterranean',
  cuisines: ['Italian', 'Mediterranean'],
  mealTypes: ['Dinner', 'Main Course'],
  notes: 'Updated family notes',
};

const fieldKeys = [
  'title',
  'description',
  'servings',
  'servingsNoun',
  'prepMinutes',
  'cookMinutes',
  'totalMinutes',
  'restMinutes',
  'difficulty',
  'cuisine',
  'cuisines',
  'mealTypes',
  'notes',
];

const localeCases = [
  {
    locale: 'en',
    messages: enMessages,
    labels: [
      'Title',
      'Description',
      'Servings',
      'Serving unit',
      'Prep time',
      'Cook time',
      'Total time',
      'Rest time',
      'Difficulty',
      'Cuisine',
      'Cuisines',
      'Meals & courses',
      'Notes',
    ],
  },
  {
    locale: 'es',
    messages: esMessages,
    labels: [
      'Título',
      'Descripción',
      'Raciones',
      'Unidad de ración',
      'Tiempo de preparación',
      'Tiempo de cocción',
      'Tiempo total',
      'Tiempo de reposo',
      'Dificultad',
      'Cocina',
      'Cocinas',
      'Comidas y platos',
      'Notas',
    ],
  },
  {
    locale: 'de',
    messages: deMessages,
    labels: [
      'Titel',
      'Beschreibung',
      'Portionen',
      'Portionseinheit',
      'Vorbereitungszeit',
      'Garzeit',
      'Gesamtzeit',
      'Ruhezeit',
      'Schwierigkeit',
      'Küche',
      'Küchen',
      'Mahlzeiten und Gänge',
      'Notizen',
    ],
  },
  {
    locale: 'ar',
    messages: arMessages,
    labels: [
      'العنوان',
      'الوصف',
      'الحصص',
      'وحدة الحصة',
      'وقت التحضير',
      'وقت الطهي',
      'الوقت الإجمالي',
      'وقت الراحة',
      'الصعوبة',
      'المطبخ',
      'المطابخ',
      'الوجبات والأطباق',
      'ملاحظات',
    ],
  },
] as const;

describe('VersionCompare metadata localization (#1198)', () => {
  it.each(localeCases)(
    'presents all 13 scalar keys in $locale without changing the diff or author values',
    async ({ locale, messages, labels }) => {
      const diff = diffRecipeSnapshots(before, after);
      const originalDiff = structuredClone(diff);
      expect(diff.fields.map((field) => field.key)).toEqual(fieldKeys);
      expect(diff.fields.map((field) => field.label)).toEqual(localeCases[0].labels);
      expect(Object.keys(messages.versionCompare.fields)).toEqual(fieldKeys);
      expect(diff.summary).toEqual({ changed: 13, added: 0, removed: 0 });
      vi.mocked(compareRecipeVersionsAction).mockResolvedValue({ ok: true, diff });

      render(
        <IntlWrapper locale={locale} messages={messages}>
          <VersionCompare
            recipeId="recipe-localization"
            versions={[{ versionNumber: 1, label: 'Author version label' }]}
          />
        </IntlWrapper>,
      );
      expect(
        screen.getByRole('combobox', { name: messages.versionCompare.fromAria }),
      ).toHaveTextContent('v1 · Author version label');
      expect(
        screen.getByRole('combobox', { name: messages.versionCompare.toAria }),
      ).toHaveTextContent(messages.versionCompare.currentRecipe);
      fireEvent.click(screen.getByRole('button', { name: messages.versionCompare.compare }));

      await screen.findByText(labels[0], { exact: true });
      const region = screen.getByRole('region', { name: messages.versionCompare.aria });
      const rows = within(region).getAllByRole('listitem');
      expect(rows).toHaveLength(13);
      rows.forEach((row, index) => {
        expect(row.querySelector('.font-medium')).toHaveTextContent(labels[index]!);
        expect(
          within(row).getByText(diff.fields[index]!.before!, { exact: true }),
        ).toBeInTheDocument();
        expect(
          within(row).getByText(diff.fields[index]!.after!, { exact: true }),
        ).toBeInTheDocument();
      });
      expect(
        within(region).getByText(messages.versionCompare.summaryChanged.replace('{count}', '13'), {
          exact: true,
        }),
      ).toBeInTheDocument();
      expect(compareRecipeVersionsAction).toHaveBeenCalledTimes(1);
      expect(compareRecipeVersionsAction).toHaveBeenCalledWith('recipe-localization', 1, 'current');
      expect(diff).toEqual(originalDiff);
    },
  );

  it('retains the supplied label for an unknown legacy field key', async () => {
    const diff = diffRecipeSnapshots(before, before);
    diff.fields = [
      {
        key: 'legacyField',
        label: 'Legacy label',
        before: 'Author before',
        after: 'Author after',
      },
    ];
    diff.identical = false;
    diff.summary.changed = 1;
    vi.mocked(compareRecipeVersionsAction).mockResolvedValue({ ok: true, diff });
    render(
      <IntlWrapper locale="de" messages={deMessages}>
        <VersionCompare
          recipeId="recipe-legacy"
          versions={[{ versionNumber: 1, label: 'Saved' }]}
        />
      </IntlWrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vergleichen' }));
    expect(await screen.findByText('Legacy label')).toBeInTheDocument();
    expect(screen.getByText('Author before')).toBeInTheDocument();
    expect(screen.getByText('Author after')).toBeInTheDocument();
  });
});
