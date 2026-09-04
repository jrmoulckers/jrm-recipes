import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '~/components/theme/theme-provider';
import type { UITheme } from '~/config/themes';
import { IntlWrapper } from '~/test/intl';
import { RecipeCreationFlow, resolveRecipeCreationFlow } from './recipe-creation-flow';

vi.mock('./guided-recipe-entry', () => ({
  GuidedRecipeEntry: () => <div>Guided entry</div>,
}));

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(cleanup);

function renderFlow(
  theme: UITheme,
  props: Partial<React.ComponentProps<typeof RecipeCreationFlow>> = {},
) {
  render(
    <IntlWrapper>
      <ThemeProvider initialTheme={theme} initialScheme="light">
        <RecipeCreationFlow hasPrefill={false} fullEditor={<div>Full editor</div>} {...props} />
      </ThemeProvider>
    </IntlWrapper>,
  );
}

describe('recipe creation flow selection (#398)', () => {
  it.each(['kitchen', 'whimsy', 'professional'] as const)(
    'keeps the incumbent editor first in %s mode',
    (theme) => {
      renderFlow(theme);
      expect(screen.getByText('Full editor')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /add step by step/i })).toHaveAttribute(
        'href',
        '/recipes/new?flow=guided',
      );
    },
  );

  it.each(['kids', 'barebones'] as const)('prioritizes a clear choice in %s mode', (theme) => {
    renderFlow(theme);
    expect(
      screen.getByRole('heading', { name: /how would you like to add your recipe/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /step by step/i })).toHaveAttribute(
      'href',
      '/recipes/new?flow=guided',
    );
  });

  it('lets an explicit guided request win', () => {
    renderFlow('kitchen', { requestedFlow: 'guided' });
    expect(screen.getByText('Guided entry')).toBeInTheDocument();
    expect(screen.queryByText('Full editor')).not.toBeInTheDocument();
  });

  it('forces prefills into the full editor without a guided callout', () => {
    renderFlow('kids', { requestedFlow: 'guided', hasPrefill: true });
    expect(screen.getByText('Full editor')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /add step by step/i })).not.toBeInTheDocument();
  });

  it('resolves explicit, prefilled, and simplified defaults deterministically', () => {
    expect(
      resolveRecipeCreationFlow({
        requestedFlow: 'guided',
        hasPrefill: false,
        simplifiedChrome: false,
      }),
    ).toBe('guided');
    expect(
      resolveRecipeCreationFlow({
        requestedFlow: 'guided',
        hasPrefill: true,
        simplifiedChrome: true,
      }),
    ).toBe('full');
    expect(
      resolveRecipeCreationFlow({
        hasPrefill: false,
        simplifiedChrome: true,
      }),
    ).toBe('choice');
  });
});
