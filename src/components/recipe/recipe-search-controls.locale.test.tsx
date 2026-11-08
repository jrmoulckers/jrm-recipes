import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPPORTED_LOCALES, type Locale } from '~/config/i18n';
import { namespacesForPathname, pickMessages } from '~/i18n/messages';
import { RECIPE_PRESETS } from '~/lib/recipe-presets';
import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
import { parseRecipeSearch, recipeSortLabels, recipeSortValues } from '~/server/recipes/search';
import { IntlWrapper } from '~/test/intl';
import { RecipeSearchControls } from './recipe-search-controls';

const catalogs = { en, es, de, ar };
const navigation = vi.hoisted(() => ({
  query: '',
  push: vi.fn<(href: string, options: { scroll: boolean }) => void>(),
}));
vi.mock('next/navigation', () => {
  const router = { push: navigation.push };
  return {
    useRouter: () => router,
    usePathname: () => '/recipes',
    useSearchParams: () => new URLSearchParams(navigation.query),
  };
});
vi.mock('~/components/recipe/saved-searches', () => ({ SavedSearches: () => null }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

function controls(locale: Locale, personalized = false) {
  return (
    <IntlWrapper
      locale={locale}
      messages={pickMessages(catalogs[locale], namespacesForPathname('/recipes'))}
    >
      <RecipeSearchControls
        search={parseRecipeSearch(Object.fromEntries(new URLSearchParams(navigation.query)))}
        facets={{ cuisines: [], meals: [], tags: [] }}
        signedIn={personalized}
        members={personalized ? [{ id: 'member-1', name: 'Author name' }] : []}
      />
    </IntlWrapper>
  );
}

beforeEach(() => {
  navigation.query = '';
  navigation.push.mockClear();
});
afterEach(cleanup);

describe.each(SUPPORTED_LOCALES)('recipe search presentation in %s (#1211)', (locale) => {
  const messages = catalogs[locale].recipeSearch;

  it('covers exactly the canonical preset and sort IDs in the route catalog', () => {
    expect(namespacesForPathname('/recipes')).toContain('recipeSearch');
    expect(Object.keys(messages.presets).sort()).toEqual(
      RECIPE_PRESETS.map((preset) => preset.id).sort(),
    );
    expect(Object.keys(messages.sortOptions).sort()).toEqual([...recipeSortValues].sort());
    for (const [id, preset] of Object.entries(messages.presets)) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      const source = RECIPE_PRESETS.find((item) => item.id === id)!;
      if (locale === 'en') {
        expect(preset).toEqual({ label: source.label, description: source.description });
      } else {
        expect(preset.label).not.toBe(source.label);
        expect(preset.description).not.toBe(source.description);
      }
    }
    for (const sort of recipeSortValues) {
      if (locale === 'en') {
        expect(messages.sortOptions[sort]).toBe(recipeSortLabels[sort]);
      } else {
        expect(messages.sortOptions[sort]).not.toBe(recipeSortLabels[sort]);
      }
    }
  });

  it('renders generic labels and helper titles from real route-scoped messages', () => {
    render(controls(locale));
    for (const preset of Object.values(messages.presets)) {
      expect(screen.getByRole('button', { name: preset.label })).toHaveAttribute(
        'title',
        preset.description,
      );
    }
    expect(screen.getByRole('combobox', { name: messages.field.sort })).toHaveTextContent(
      messages.sortOptions.newest,
    );
  });

  it.each(recipeSortValues)(
    'renders the selected %s sort without changing its URL value',
    (sort) => {
      navigation.query = `sort=${sort}`;
      render(controls(locale));
      expect(screen.getByRole('combobox', { name: messages.field.sort })).toHaveTextContent(
        messages.sortOptions[sort],
      );
      expect(navigation.push).not.toHaveBeenCalled();
    },
  );

  it('keeps canonical preset params, unrelated filters, toggle-off and contextual sort', () => {
    navigation.query = 'q=soup&tag=family';
    const { rerender } = render(controls(locale));
    fireEvent.click(screen.getByRole('button', { name: messages.presets.weeknight.label }));
    let url = new URL(navigation.push.mock.lastCall![0], 'https://example.com');
    expect([...url.searchParams.entries()]).toEqual([
      ['q', 'soup'],
      ['tag', 'family'],
      ['maxTime', '30'],
      ['difficulty', 'easy'],
      ['sort', 'quickest'],
    ]);
    navigation.query = url.search.slice(1);
    rerender(controls(locale));
    const weeknight = screen.getByRole('button', { name: messages.presets.weeknight.label });
    expect(weeknight).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(weeknight);
    url = new URL(navigation.push.mock.lastCall![0], 'https://example.com');
    expect(url.search).toBe('?q=soup&tag=family');
    navigation.query = url.search.slice(1);
    rerender(controls(locale));
    expect(screen.getByRole('combobox', { name: messages.field.sort })).toHaveTextContent(
      messages.sortOptions.relevance,
    );
    fireEvent.click(screen.getByRole('button', { name: messages.presets['kid-friendly'].label }));
    expect(
      new URL(navigation.push.mock.lastCall![0], 'https://example.com').searchParams.getAll('tag'),
    ).toEqual(['family', 'kid-friendly']);
  });

  it('preserves personalized labels and author-entered names', () => {
    render(controls(locale, true));
    expect(screen.getByRole('button', { name: messages.myRecipes })).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: messages.quickPick.safeFor.replace('{name}', 'Author name'),
      }),
    ).toHaveAttribute('title', messages.safeForNote);
  });
});
