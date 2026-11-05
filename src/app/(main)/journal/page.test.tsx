import { cloneElement, isValidElement, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPPORTED_LOCALES, type Locale } from '~/config/i18n';
import { emptyNutritionRollUp } from '~/lib/nutrition-rollup';
import type * as CookQueries from '~/server/cooklog/queries';
import type * as DietaryQueries from '~/server/dietary/queries';
import type * as NutritionQueries from '~/server/recipes/nutrition-rollup';
import { IntlWrapper } from '~/test/intl';
import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';

const state = vi.hoisted(() => ({
  locale: 'en' as Locale,
  user: null as { id: string } | null,
  dbConfigured: true,
  authConfigured: true,
  options: vi.fn<typeof CookQueries.getCookedRecipeOptions>(),
  cooks: vi.fn<typeof CookQueries.getFilteredCooks>(),
  insights: vi.fn<typeof CookQueries.getJournalInsights>(),
  members: vi.fn<typeof DietaryQueries.listMemberProfiles>(),
  nutrition: vi.fn<typeof NutritionQueries.rollUpMealNutritionWithTargets>(),
}));
const catalogs = { en, es, de, ar };
type JournalNamespace =
  | 'metadata'
  | 'dbNotice'
  | 'cookLog.section'
  | 'cookLog.journal'
  | 'cookLog.journal.insights'
  | 'cookLog.journal.entry'
  | 'cookLog.journal.empty'
  | 'cookLog.journal.noMatches'
  | 'cookLog.journal.signedOut';

vi.mock('next-intl/server', () => ({
  getLocale: async () => state.locale,
  getTranslations: async (namespace: JournalNamespace) =>
    createTranslator({
      locale: state.locale,
      messages: catalogs[state.locale],
      namespace,
    }),
}));
vi.mock('~/server/auth', () => ({
  getCurrentUser: async () => state.user,
  isAuthConfigured: () => state.authConfigured,
}));
vi.mock('~/server/db', () => ({ isDbConfigured: () => state.dbConfigured }));
vi.mock('~/server/cooklog/queries', () => ({
  getCookedRecipeOptions: state.options,
  getFilteredCooks: state.cooks,
  getJournalInsights: state.insights,
}));
vi.mock('~/server/dietary/queries', () => ({ listMemberProfiles: state.members }));
vi.mock('~/server/recipes/nutrition-rollup', () => ({
  rollUpMealNutritionWithTargets: state.nutrition,
}));
vi.mock('~/components/i18n/route-messages', () => ({
  withRouteMessages: (Page: unknown) => Page,
}));
vi.mock('~/components/auth/sign-in-refresh-button', () => ({
  SignInRefreshButton: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock('~/components/cooklog/journal-filters', () => ({
  JournalFilters: vi.fn((_props: Parameters<typeof JournalFilters>[0]) => (
    <div data-testid="journal-filters" />
  )),
}));
vi.mock('~/components/nutrition/nutrition-rollup-card', () => ({
  NutritionRollUpCard: vi.fn(({ title }: { title: string }) => <section aria-label={title} />),
}));

import JournalPage from './page';
import { JournalFilters } from '~/components/cooklog/journal-filters';
import { NutritionRollUpCard } from '~/components/nutrition/nutrition-rollup-card';

// Resolve async server helpers before jsdom renders the remaining client/DOM tree.
async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (typeof node.type === 'function' && node.type.constructor.name === 'AsyncFunction') {
    const component = node.type as (props: { children?: ReactNode }) => Promise<ReactNode>;
    return resolveServerTree(await component(node.props));
  }
  if (node.props.children === undefined) return node;
  return cloneElement(node, {
    children: await resolveServerTree(node.props.children),
  });
}

async function renderJournal(params: { recipe?: string; range?: string } = {}) {
  const tree = await JournalPage({ searchParams: Promise.resolve(params) });
  render(
    <IntlWrapper locale={state.locale} messages={catalogs[state.locale]}>
      {await resolveServerTree(tree)}
    </IntlWrapper>,
  );
}

function expectNoPersonalQueries() {
  for (const query of [
    state.options,
    state.cooks,
    state.insights,
    state.members,
    state.nutrition,
  ]) {
    expect(query).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  state.locale = 'en';
  state.user = null;
  state.dbConfigured = true;
  state.authConfigured = true;
  state.options.mockResolvedValue([]);
  state.cooks.mockResolvedValue([]);
  state.insights.mockResolvedValue({ totalCooks: 0, mostRecent: null, topRecipes: [] });
  state.members.mockResolvedValue([]);
  state.nutrition.mockResolvedValue({ rollUp: emptyNutritionRollUp(), adherence: [] });
});
afterEach(cleanup);

describe.each(SUPPORTED_LOCALES)('signed-out Journal in %s', (locale) => {
  it.each([true, false])(
    'distinguishes unqueried history with auth configured=%s',
    async (configured) => {
      state.locale = locale;
      state.authConfigured = configured;
      await renderJournal({ recipe: 'untrusted-recipe', range: 'month' });
      const copy = catalogs[locale].cookLog.journal;
      expect(screen.getByRole('heading', { name: copy.signedOut.title })).toBeVisible();
      expect(screen.getByText(copy.signedOut.body)).toBeVisible();
      expect(screen.queryByText(copy.empty.title)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: copy.empty.cta })).not.toBeInTheDocument();
      if (configured) {
        expect(screen.getByRole('button', { name: copy.signedOut.cta })).toBeEnabled();
        expect(screen.queryByText(copy.signedOut.unavailable)).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(copy.signedOut.unavailable)).toBeVisible();
        expect(screen.queryByRole('button', { name: copy.signedOut.cta })).not.toBeInTheDocument();
      }
      expect(JournalFilters).not.toHaveBeenCalled();
      expect(NutritionRollUpCard).not.toHaveBeenCalled();
      expectNoPersonalQueries();
    },
  );
});

describe('Journal state precedence', () => {
  it.each([null, { id: 'journal-user' }])('keeps the DB notice first for user=%j', async (user) => {
    state.dbConfigured = false;
    state.user = user;
    await renderJournal();
    expect(screen.getByRole('heading', { name: en.dbNotice.title })).toBeVisible();
    expect(screen.queryByText(en.cookLog.journal.signedOut.title)).not.toBeInTheDocument();
    expect(screen.queryByText(en.cookLog.journal.empty.title)).not.toBeInTheDocument();
    expectNoPersonalQueries();
  });

  it('keeps first-cook guidance for authenticated empty history', async () => {
    state.user = { id: 'journal-user' };
    await renderJournal();
    expect(screen.getByRole('heading', { name: en.cookLog.journal.empty.title })).toBeVisible();
    expect(screen.getByRole('link', { name: en.cookLog.journal.empty.cta })).toHaveAttribute(
      'href',
      '/recipes',
    );
    expect(screen.queryByText(en.cookLog.journal.signedOut.title)).not.toBeInTheDocument();
    expect(state.options).toHaveBeenCalledExactlyOnceWith('journal-user');
    expect(state.cooks).toHaveBeenCalledExactlyOnceWith('journal-user', {
      recipeId: null,
      since: null,
    });
  });

  it('preserves filtered entries, insights, servings, and nutrition for authenticated history', async () => {
    state.user = { id: 'journal-user' };
    const recipe = {
      id: 'recipe-1',
      slug: 'family-soup',
      title: 'Family soup',
      coverImageUrl: null,
    };
    const cookedAt = new Date('2026-01-15T12:00:00Z');
    state.options.mockResolvedValue([recipe]);
    state.cooks.mockResolvedValue([
      { id: 'cook-1', cookedAt, note: 'Added lemon', photoUrl: null, servingsMade: 2, recipe },
    ]);
    state.insights.mockResolvedValue({
      totalCooks: 1,
      mostRecent: cookedAt,
      topRecipes: [{ ...recipe, count: 1 }],
    });
    const rollUp = { ...emptyNutritionRollUp(), mealCount: 1, servings: 2 };
    state.nutrition.mockResolvedValue({ rollUp, adherence: [] });
    await renderJournal({ recipe: recipe.id, range: 'year' });
    expect(screen.getByRole('heading', { name: recipe.title })).toBeVisible();
    expect(screen.getByText('Added lemon')).toBeVisible();
    expect(screen.getByText(en.cookLog.journal.insights.mostRecent)).toBeVisible();
    expect(screen.queryByText(en.cookLog.journal.signedOut.title)).not.toBeInTheDocument();
    const filter = { recipeId: recipe.id, since: expect.any(Date) };
    expect(state.cooks).toHaveBeenCalledExactlyOnceWith('journal-user', filter);
    expect(state.insights).toHaveBeenCalledExactlyOnceWith('journal-user', filter);
    expect(vi.mocked(JournalFilters).mock.calls[0]?.[0]).toEqual({
      recipes: [recipe],
      selectedRecipeId: recipe.id,
      selectedRange: 'year',
    });
    expect(state.nutrition).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'journal-user',
        meals: [expect.objectContaining({ id: 'cook-1', recipeId: recipe.id, servings: 2 })],
      }),
    );
    expect(vi.mocked(NutritionRollUpCard).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        rollUp,
        adherence: [],
        adherenceBasis: 'loggedDay',
      }),
    );
  });

  it.each([true, false])(
    'preserves authenticated no-matches guidance with filters=%s',
    async (filtered) => {
      state.user = { id: 'journal-user' };
      state.options.mockResolvedValue([{ id: 'recipe-1', title: 'Family soup' }]);
      await renderJournal(
        filtered ? { recipe: 'recipe-1', range: 'month' } : { recipe: 'stale-recipe' },
      );
      expect(screen.getByText(en.cookLog.journal.noMatches.title)).toBeVisible();
      expect(
        screen.getByText(
          filtered
            ? en.cookLog.journal.noMatches.withFilters
            : en.cookLog.journal.noMatches.withoutFilters,
        ),
      ).toBeVisible();
      expect(screen.queryByText(en.cookLog.journal.empty.title)).not.toBeInTheDocument();
      expect(screen.queryByText(en.cookLog.journal.signedOut.title)).not.toBeInTheDocument();
      if (filtered) {
        expect(
          screen.getByRole('link', { name: en.cookLog.journal.noMatches.clearFilters }),
        ).toHaveAttribute('href', '/journal');
      } else {
        expect(
          screen.queryByRole('link', { name: en.cookLog.journal.noMatches.clearFilters }),
        ).not.toBeInTheDocument();
        expect(state.cooks).toHaveBeenCalledWith('journal-user', { recipeId: null, since: null });
      }
      expect(state.nutrition).not.toHaveBeenCalled();
      expect(NutritionRollUpCard).toHaveBeenCalled();
    },
  );
});
