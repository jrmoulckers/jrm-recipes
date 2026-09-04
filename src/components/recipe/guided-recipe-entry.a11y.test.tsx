import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from '~/components/ui/confirm-dialog';
import { IntlWrapper } from '~/test/intl';
import { GuidedRecipeEntry } from './guided-recipe-entry';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('~/server/recipes/actions', () => ({
  createRecipeAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('~/components/recipe/recipe-preview', () => ({
  RecipePreview: () => <div>Recipe preview</div>,
}));

afterEach(cleanup);

function renderGuided() {
  render(
    <IntlWrapper>
      <ConfirmProvider>
        <GuidedRecipeEntry />
      </ConfirmProvider>
    </IntlWrapper>,
  );
}

describe('GuidedRecipeEntry accessibility (#398)', () => {
  it('announces progress and marks the current step', () => {
    renderGuided();

    expect(screen.getByRole('navigation', { name: 'Recipe entry progress' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('1');
  });

  it('focuses the invalid field and then the next step heading', async () => {
    const user = userEvent.setup();
    renderGuided();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByLabelText('Recipe name')).toHaveFocus());

    await user.type(screen.getByLabelText('Recipe name'), 'Pie');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /what ingredients/i })).toHaveFocus(),
    );
  });

  it('can reach the first field and advance using only the keyboard', async () => {
    const user = userEvent.setup();
    renderGuided();

    await user.tab();
    while (document.activeElement !== screen.getByLabelText('Recipe name')) {
      await user.tab();
    }
    await user.keyboard('Pie');
    while (document.activeElement !== screen.getByRole('button', { name: 'Next' })) {
      await user.tab();
    }
    await user.keyboard('{Enter}');

    expect(await screen.findByLabelText('Ingredient 1')).toBeInTheDocument();
  });

  it('keeps focus in context after removing the focused row', async () => {
    const user = userEvent.setup();
    renderGuided();

    await user.type(screen.getByLabelText('Recipe name'), 'Pie');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add another ingredient' }));
    const removeSecond = screen.getByRole('button', { name: 'Remove ingredient 2' });
    await user.type(removeSecond, '{Enter}');

    await waitFor(() => expect(screen.getByLabelText('Ingredient 1')).toHaveFocus());
  });
});
