import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { SearchResultsFeed } from './search-results-feed';
import { type RecipeSearchResult } from '~/server/recipes/queries';
import { IntlWrapper } from '~/test/intl';

vi.mock('~/server/recipes/search-actions', () => ({
  loadMoreSearchAction: vi.fn(),
}));

vi.mock('~/components/recipe/recipe-card', () => ({
  RecipeCard: ({ recipe }: { recipe: { title: string } }) => <article>{recipe.title}</article>,
}));

afterEach(cleanup);

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
});
