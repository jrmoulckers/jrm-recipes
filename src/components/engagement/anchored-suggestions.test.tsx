import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { AnchoredSuggestions } from './anchored-suggestions';

vi.mock('~/server/engagement/actions', () => ({
  addCommentAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

describe('AnchoredSuggestions compact trigger', () => {
  it('uses an ingredient-specific icon button and opens the inline composer', async () => {
    const user = userEvent.setup();

    rtlRender(
      <IntlWrapper>
        <AnchoredSuggestions
          recipeId="recipe_1"
          recipeSlug="pancakes"
          anchorType="ingredient"
          anchorId="flour"
          anchorLabel="flour"
          canInteract
          suggestions={[]}
          compactTrigger
        />
      </IntlWrapper>,
    );

    const trigger = screen.getByRole('button', { name: 'Suggest an edit for flour' });
    expect(trigger).toHaveAttribute('title', 'Suggest an edit for flour');
    expect(screen.queryByText('Suggest an edit')).not.toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByPlaceholderText('Suggest an edit for flour…')).toHaveFocus();
  });
});
