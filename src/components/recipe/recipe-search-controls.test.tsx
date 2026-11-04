import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseRecipeSearch } from '~/server/recipes/search';
import { IntlWrapper } from '~/test/intl';
import { RecipeSearchControls } from './recipe-search-controls';

const navigation = vi.hoisted(() => ({
  query: 'q=n&ingredient=egg',
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

function controls(qs = navigation.query) {
  return (
    <IntlWrapper>
      <RecipeSearchControls
        search={parseRecipeSearch(Object.fromEntries(new URLSearchParams(qs)))}
        facets={{ cuisines: [], meals: [], tags: [] }}
      />
    </IntlWrapper>
  );
}

function pause(ms = 250) {
  act(() => vi.advanceTimersByTime(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  navigation.query = 'q=n&ingredient=egg';
  navigation.push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RecipeSearchControls search stability (#1171)', () => {
  it.each([
    ['Search recipes', 'q', 'na', 'newer draft'],
    ['Filter by ingredient', 'ingredient', 'eggs', 'egg noodles'],
  ])('preserves newer %s text when an earlier navigation commits', (label, key, first, latest) => {
    const { rerender } = render(controls());
    const input = screen.getByRole('searchbox', { name: label });
    fireEvent.change(input, { target: { value: first } });
    pause();
    const requested = new URL(navigation.push.mock.calls[0]![0], 'https://example.com');
    expect(requested.searchParams.get(key)).toBe(first);
    fireEvent.change(input, { target: { value: latest } });
    navigation.query = requested.search.slice(1);
    rerender(controls());
    expect(input).toHaveValue(latest);
    pause();
    expect(
      new URL(navigation.push.mock.lastCall![0], 'https://example.com').searchParams.get(key),
    ).toBe(latest);
  });

  it('does not keep submitting a draft while its navigation is pending', () => {
    render(controls());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'noodles' },
    });
    pause(1250);
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it('submits both text filters together and composes subsequent quick filters', () => {
    render(controls());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'noodles' },
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter by ingredient' }), {
      target: { value: 'egg noodles' },
    });
    pause();
    expect(navigation.push).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Weeknight' }));
    const params = new URL(navigation.push.mock.lastCall![0], 'https://example.com').searchParams;
    expect(params.get('q')).toBe('noodles');
    expect(params.get('ingredient')).toBe('egg noodles');
    expect(params.get('maxTime')).toBe('30');
  });

  it('keeps clear available while a request is pending and does not restore cleared text', () => {
    const { rerender } = render(controls());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'na' },
    });
    pause();
    const requested = navigation.push.mock.lastCall![0];
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    navigation.query = new URL(requested, 'https://example.com').search.slice(1);
    rerender(controls());
    expect(screen.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
    pause();
    expect(
      new URL(navigation.push.mock.lastCall![0], 'https://example.com').searchParams.has('q'),
    ).toBe(false);
  });

  it('accepts external URLs and back/forward even when drafts are unsent', () => {
    const { rerender } = render(controls());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'unsent' },
    });
    navigation.query = 'q=soup&ingredient=onion';
    rerender(controls());
    expect(screen.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('soup');
    expect(screen.getByRole('searchbox', { name: 'Filter by ingredient' })).toHaveValue('onion');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'unsent again' },
    });
    act(() => {
      window.history.replaceState(null, '', '/recipes?q=soup&ingredient=onion');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('soup');
    pause();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('accepts an external URL after cancelling a navigation back to the committed URL', () => {
    const { rerender } = render(controls());
    const input = screen.getByRole('searchbox', { name: 'Search recipes' });
    fireEvent.change(input, { target: { value: 'na' } });
    pause();
    const abandoned = new URL(
      navigation.push.mock.lastCall![0],
      'https://example.com',
    ).search.slice(1);
    fireEvent.change(input, { target: { value: 'n' } });
    pause();
    expect(new URL(navigation.push.mock.lastCall![0], 'https://example.com').search.slice(1)).toBe(
      navigation.query,
    );
    navigation.query = abandoned;
    rerender(controls());
    expect(input).toHaveValue('na');
    pause();
    expect(navigation.push).toHaveBeenCalledTimes(2);
  });
});
