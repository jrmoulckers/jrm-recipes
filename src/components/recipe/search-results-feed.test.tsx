import { cleanup, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { SearchResultsFeed } from './search-results-feed';
import { type RecipeSearchResult } from '~/server/recipes/queries';
import { IntlWrapper } from '~/test/intl';
import {
  loadMorePossibleSearchAction,
  loadMoreSearchAction,
} from '~/server/recipes/search-actions';

vi.mock('~/server/recipes/search-actions', () => ({
  loadMoreSearchAction: vi.fn(),
  loadMorePossibleSearchAction: vi.fn(),
}));

vi.mock('~/components/recipe/recipe-card', () => ({
  RecipeCard: ({ recipe }: { recipe: { title: string } }) => <article>{recipe.title}</article>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

function recipe(id: string, title: string): RecipeSearchResult {
  return { id, title } as RecipeSearchResult;
}

describe('SearchResultsFeed', () => {
  it('replaces client-owned results when the filter query changes', () => {
    const { rerender } = render(
      <SearchResultsFeed
        initialItems={[recipe('american', 'Fried Green Tomatoes')]}
        initialNextOffset={null}
        queryString="meal=Dinner"
      />,
    );

    rerender(
      <IntlWrapper>
        <SearchResultsFeed
          initialItems={[recipe('italian', 'Spaghetti Carbonara')]}
          initialNextOffset={null}
          queryString="meal=Dinner&cuisine=Italian"
        />
      </IntlWrapper>,
    );

    expect(screen.getByText('Spaghetti Carbonara')).toBeTruthy();
    expect(screen.queryByText('Fried Green Tomatoes')).toBeNull();
  });

  it('separates medium-confidence dietary results from normal matches', () => {
    render(
      <SearchResultsFeed
        initialItems={[recipe('high', 'Trusted Soup')]}
        initialNextOffset={null}
        initialPossibleItems={[recipe('possible', 'Possible Stew')]}
        initialPossibleNextOffset={null}
        queryString="diet=vegan"
        showDietaryBands
      />,
    );

    expect(screen.getByRole('heading', { name: 'Matches' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Possible matches' })).toBeTruthy();
    expect(screen.getByText('Trusted Soup')).toBeTruthy();
    expect(screen.getByText('Possible Stew')).toBeTruthy();
  });

  it('pages Possible matches with their independent action and cursor', async () => {
    const user = userEvent.setup();
    vi.mocked(loadMorePossibleSearchAction).mockResolvedValue({
      items: [recipe('possible-1', 'Possible One'), recipe('possible-2', 'Possible Two')],
      nextOffset: null,
    });
    render(
      <SearchResultsFeed
        initialItems={[recipe('high', 'Trusted Soup')]}
        initialPossibleItems={[recipe('possible-1', 'Possible One')]}
        initialNextOffset={null}
        initialPossibleNextOffset={60}
        queryString="diet=vegan"
        showDietaryBands
      />,
    );

    const possibleSection = screen.getByRole('region', { name: 'Possible matches' });
    await user.click(
      within(possibleSection).getByRole('button', { name: 'Load more possible matches' }),
    );
    await waitFor(() =>
      expect(within(possibleSection).getByText('Possible Two')).toBeInTheDocument(),
    );

    expect(within(possibleSection).getAllByText('Possible One')).toHaveLength(1);
    expect(loadMorePossibleSearchAction).toHaveBeenCalledWith('diet=vegan', 60);
    expect(loadMoreSearchAction).not.toHaveBeenCalled();
  });
});
