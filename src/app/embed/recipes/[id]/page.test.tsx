import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';

import { SUPPORTED_LOCALES, type Locale } from '~/config/i18n';
import type { EmbedRecipeRouteParams } from '~/lib/route-params';
import type { PublicRecipeCard } from '~/server/recipes/queries';
import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';

const state = vi.hoisted(() => ({
  locale: 'en' as Locale,
  getPublicRecipeCard: vi.fn<(id: string) => Promise<PublicRecipeCard | null>>(),
}));
const catalogs = { en, es, de, ar };

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'embed' | 'recipeDetail') =>
    createTranslator({
      locale: state.locale,
      messages: catalogs[state.locale],
      namespace,
    }),
}));
vi.mock('~/server/recipes/queries', () => ({
  getPublicRecipeCard: state.getPublicRecipeCard,
}));
vi.mock('~/components/i18n/route-messages', () => ({
  withRouteMessages: (
    Page: (props: { params: Promise<EmbedRecipeRouteParams> }) => Promise<ReactNode>,
  ) => Page,
}));
vi.mock('~/components/recipe/recipe-image', () => ({ RecipeImage: () => null }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import EmbedRecipePage from './page';

const recipe = {
  id: 'public-recipe-id',
  slug: 'family-recipe',
  title: 'Family recipe',
  description: 'Our original family instructions.',
  coverImageUrl: null,
  cuisine: null,
  servings: 4,
  servingsNoun: 'bowls',
  totalMinutes: 30,
  difficulty: 'medium',
  author: { name: 'Family cook', handle: 'family-cook', slug: 'family-cook' },
  tags: [],
} satisfies PublicRecipeCard;

async function renderRecipe(overrides: Partial<PublicRecipeCard> = {}) {
  state.getPublicRecipeCard.mockResolvedValue({ ...recipe, ...overrides });
  render(await EmbedRecipePage({ params: Promise.resolve({ id: recipe.id }) }));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
  state.getPublicRecipeCard.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe.each(SUPPORTED_LOCALES)('public recipe embed in %s', (locale) => {
  beforeEach(() => {
    state.locale = locale;
  });

  it.each(['easy', 'medium', 'hard'] as const)(
    'localizes %s difficulty without changing authored content or backlink',
    async (difficulty) => {
      await renderRecipe({ difficulty });

      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        '30 min',
        '4 bowls',
        catalogs[locale].recipeDetail.difficulty[difficulty],
      ]);
      expect(screen.getByRole('heading', { name: recipe.title })).toBeVisible();
      expect(screen.getByText(recipe.description)).toBeVisible();
      const t = createTranslator({ locale, messages: catalogs[locale], namespace: 'embed' });
      expect(screen.getByText(t('byAuthor', { name: recipe.author.name }))).toBeVisible();
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com/recipes/family-cook/family-recipe');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveTextContent(t('viewFullRecipe'));
      expect(state.getPublicRecipeCard).toHaveBeenCalledWith(recipe.id);
    },
  );

  it('omits absent difficulty rather than inventing a value', async () => {
    await renderRecipe({ difficulty: null });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '30 min',
      '4 bowls',
    ]);
  });

  it('uses the existing localized servings fallback only when no noun was authored', async () => {
    await renderRecipe({ servingsNoun: null, difficulty: null });
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent(
      `4 ${catalogs[locale].recipeDetail.servingsNoun}`,
    );
  });
});

it('keeps unavailable or non-public recipes behind the existing not-found boundary', async () => {
  state.getPublicRecipeCard.mockResolvedValue(null);
  await expect(EmbedRecipePage({ params: Promise.resolve({ id: recipe.id }) })).rejects.toThrow(
    'NEXT_NOT_FOUND',
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
