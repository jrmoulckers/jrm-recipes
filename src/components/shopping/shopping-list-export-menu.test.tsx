import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { ShoppingListExportMenu } from './shopping-list-export-menu';
import type { ShoppingViewItem } from './shopping-list-view';

const items: ShoppingViewItem[] = [
  {
    id: 'tomatoes',
    item: 'Tomatoes',
    quantity: 4,
    quantityMax: null,
    unit: null,
    note: 'ripe',
    category: 'Produce',
    checked: false,
  },
  {
    id: 'milk',
    item: 'Milk',
    quantity: 1,
    quantityMax: null,
    unit: 'gal',
    note: null,
    category: 'Dairy & Eggs',
    checked: true,
  },
];

const list = {
  id: 'weekly',
  name: 'Weekly',
  storeNames: ['Neighborhood Market'],
  isDefault: true,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

describe('ShoppingListExportMenu', () => {
  it('offers explicit export choices and hides unsupported native share', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ShoppingListExportMenu items={items} list={list} disabled={false} />, {
      wrapper: IntlWrapper,
    });

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(screen.getByRole('menuitem', { name: 'Copy text' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Download text' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Email' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Print / Save as PDF' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Download image' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Native share' })).not.toBeInTheDocument();
  });

  it('shows native share only when capability detection succeeds', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn(),
    });
    render(<ShoppingListExportMenu items={items} list={list} disabled={false} />, {
      wrapper: IntlWrapper,
    });

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(await screen.findByRole('menuitem', { name: 'Native share' })).toBeVisible();
  });

  it('excludes completed items by default and includes them on request', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<ShoppingListExportMenu items={items} list={list} disabled={false} />, {
      wrapper: IntlWrapper,
    });

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy text' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /export/i })).toHaveFocus());
    expect(writeText.mock.calls[0]?.[0]).toContain('Weekly');
    expect(writeText.mock.calls[0]?.[0]).toContain('Store: Neighborhood Market');
    expect(writeText.mock.calls[0]?.[0]).not.toContain('Milk');

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(
      screen.getByRole('menuitemcheckbox', {
        name: /include completed items/i,
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Copy text' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1]?.[0]).toContain('- [x] 1 gallon Milk');
  });
});
