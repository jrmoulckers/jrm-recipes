import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSavedSearchAction, deleteSavedSearchAction } from '~/server/searches/actions';
import { IntlWrapper } from '~/test/intl';
import { SavedSearches } from './saved-searches';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/recipes',
}));
vi.mock('~/server/searches/actions', () => ({
  createSavedSearchAction: vi.fn(),
  deleteSavedSearchAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SavedSearches dialog focus (#1208)', () => {
  it.each(['Cancel', 'Close', 'Escape'] as const)(
    'returns focus to the exact opener after %s without saving or navigating',
    async (dismissal) => {
      const user = userEvent.setup();
      render(
        <IntlWrapper>
          <SavedSearches savedSearches={[]} currentQuery="q=Carbonara" filtersActive />
        </IntlWrapper>,
      );
      const opener = screen.getByRole('button', { name: 'Save search' });
      await user.tab();
      expect(opener).toHaveFocus();
      await user.keyboard('{Enter}');

      const dialog = await screen.findByRole('dialog', { name: 'Save this search' });
      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await waitFor(() => expect(name).toHaveFocus());
      expect(name).toHaveValue('');

      if (dismissal === 'Escape') {
        await user.keyboard('{Escape}');
      } else {
        const dismiss = within(dialog).getByRole('button', { name: dismissal });
        for (let count = 0; count < 4 && document.activeElement !== dismiss; count += 1) {
          await user.tab();
        }
        expect(dismiss).toHaveFocus();
        await user.keyboard('{Enter}');
      }

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
      });
      expect(screen.getByRole('button', { name: 'Save search' })).toBe(opener);
      expect(opener).toBeEnabled();
      expect(createSavedSearchAction).not.toHaveBeenCalled();
      expect(deleteSavedSearchAction).not.toHaveBeenCalled();
      expect(navigation.push).not.toHaveBeenCalled();
      expect(navigation.refresh).not.toHaveBeenCalled();
    },
  );

  it('saves the unchanged query, refreshes, and clears the name after success', async () => {
    vi.mocked(createSavedSearchAction).mockResolvedValue({ ok: true, id: 'mock-saved-search' });
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <SavedSearches savedSearches={[]} currentQuery="q=Carbonara" filtersActive />
      </IntlWrapper>,
    );
    const opener = screen.getByRole('button', { name: 'Save search' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Save this search' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveFocus());
    await user.type(name, 'Weeknight pasta');
    await user.click(within(dialog).getByRole('button', { name: 'Save search' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createSavedSearchAction).toHaveBeenCalledExactlyOnceWith({
      name: 'Weeknight pasta',
      query: 'q=Carbonara',
    });
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(deleteSavedSearchAction).not.toHaveBeenCalled();
    await user.click(opener);
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  it('keeps the opener disabled and out of the tab order without active filters', async () => {
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <SavedSearches savedSearches={[]} currentQuery="" filtersActive={false} />
        <button type="button">After saved searches</button>
      </IntlWrapper>,
    );
    const opener = screen.getByRole('button', { name: 'Save search' });
    expect(opener).toBeDisabled();
    expect(opener).toHaveAttribute('title', 'Add a filter or search term to save');
    await user.click(opener);
    await user.tab();
    expect(screen.getByRole('button', { name: 'After saved searches' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createSavedSearchAction).not.toHaveBeenCalled();
    expect(deleteSavedSearchAction).not.toHaveBeenCalled();
  });
});
