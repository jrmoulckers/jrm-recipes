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

  it('appends and de-duplicates Possible matches with its independent cursor', async () => {
    const user = userEvent.setup();
    vi.mocked(loadMorePossibleSearchAction).mockResolvedValue({
      items: [recipe('possible-1', 'Possible One'), recipe('possible-2', 'Possible Two')],
      nextOffset: 120,
    });

    render(
      <SearchResultsFeed
        initialItems={[recipe('definite-1', 'Definite One')]}
        initialPossibleItems={[recipe('possible-1', 'Possible One')]}
        initialNextOffset={null}
        initialPossibleNextOffset={60}
        queryString="diet=vegan"
      />,
    );

    const possibleSection = screen.getByRole('region', { name: 'Possible matches' });
    await user.click(within(possibleSection).getByRole('button', { name: 'Load more recipes' }));

    await waitFor(() =>
      expect(within(possibleSection).getByText('Possible Two')).toBeInTheDocument(),
    );
    expect(within(possibleSection).getAllByText('Possible One')).toHaveLength(1);
    expect(screen.getByText('Definite One')).toBeInTheDocument();
    expect(loadMorePossibleSearchAction).toHaveBeenCalledWith('diet=vegan', 60);
    expect(loadMoreSearchAction).not.toHaveBeenCalled();
    expect(
      within(possibleSection).getByRole('button', { name: 'Load more recipes' }),
    ).toBeInTheDocument();
  });

  it('stops offering more Possible matches when their cursor becomes null', async () => {
    const user = userEvent.setup();
    vi.mocked(loadMorePossibleSearchAction).mockResolvedValue({
      items: [recipe('possible-2', 'Possible Two')],
      nextOffset: null,
    });

    render(
      <SearchResultsFeed
        initialItems={[]}
        initialPossibleItems={[recipe('possible-1', 'Possible One')]}
        initialNextOffset={null}
        initialPossibleNextOffset={60}
        queryString="diet=vegan"
      />,
    );

    const possibleSection = screen.getByRole('region', { name: 'Possible matches' });
    await user.click(within(possibleSection).getByRole('button', { name: 'Load more recipes' }));

    await waitFor(() =>
      expect(
        within(possibleSection).queryByRole('button', { name: 'Load more recipes' }),
      ).not.toBeInTheDocument(),
    );
    expect(within(possibleSection).getByText('Possible Two')).toBeInTheDocument();
  });

  it('resets Possible matches and their cursor when filters change', async () => {
    const user = userEvent.setup();
    vi.mocked(loadMorePossibleSearchAction).mockResolvedValue({
      items: [recipe('new-possible-2', 'New Possible Two')],
      nextOffset: null,
    });

    const { rerender } = render(
      <SearchResultsFeed
        initialItems={[]}
        initialPossibleItems={[recipe('old-possible', 'Old Possible')]}
        initialNextOffset={null}
        initialPossibleNextOffset={60}
        queryString="diet=vegan"
      />,
    );

    rerender(
      <IntlWrapper>
        <SearchResultsFeed
          initialItems={[]}
          initialPossibleItems={[recipe('new-possible-1', 'New Possible One')]}
          initialNextOffset={null}
          initialPossibleNextOffset={40}
          queryString="diet=vegetarian"
        />
      </IntlWrapper>,
    );

    const possibleSection = screen.getByRole('region', { name: 'Possible matches' });
    expect(within(possibleSection).getByText('New Possible One')).toBeInTheDocument();
    expect(screen.queryByText('Old Possible')).not.toBeInTheDocument();

    await user.click(within(possibleSection).getByRole('button', { name: 'Load more recipes' }));
    await waitFor(() =>
      expect(within(possibleSection).getByText('New Possible Two')).toBeInTheDocument(),
    );
    expect(loadMorePossibleSearchAction).toHaveBeenCalledWith('diet=vegetarian', 40);
  });
});
