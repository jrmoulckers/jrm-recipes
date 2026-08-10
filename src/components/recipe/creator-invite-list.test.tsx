import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatorInviteList } from './creator-invite-list';
import {
  acceptRecipeCreatorAction,
  declineRecipeCreatorAction,
} from '~/server/recipes/creators-actions';
import { IntlWrapper } from '~/test/intl';

vi.mock('~/server/recipes/creators-actions', () => ({
  acceptRecipeCreatorAction: vi.fn(),
  declineRecipeCreatorAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRouter: () => ({ refresh, push: vi.fn() }) };
});

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => {
      toastSuccess(m);
    },
    error: (m: string) => {
      toastError(m);
    },
  },
}));

const mockedAccept = vi.mocked(acceptRecipeCreatorAction);
const mockedDecline = vi.mocked(declineRecipeCreatorAction);

const INVITES = [
  { recipeId: 'rec_1', title: 'Apple Pie', ownerName: 'Ada' },
  { recipeId: 'rec_2', title: 'Rye Loaf', ownerName: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderList(invites = INVITES) {
  return render(
    <IntlWrapper>
      <CreatorInviteList invites={invites} />
    </IntlWrapper>,
  );
}

describe('CreatorInviteList (#668)', () => {
  it('names the inviter, falling back when they have no display name', () => {
    renderList();
    expect(screen.getByText('From Ada')).toBeInTheDocument();
    expect(screen.getByText('From another cook')).toBeInTheDocument();
  });

  it('shows an empty state rather than an empty list', () => {
    renderList([]);
    expect(screen.getByText(/no invitations right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('accepts the invitation it was clicked on, not the first one', async () => {
    const user = userEvent.setup();
    mockedAccept.mockResolvedValue({ ok: true, slug: 'rye-loaf' });
    renderList();

    await user.click(screen.getAllByRole('button', { name: /accept/i })[1]!);

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledWith({ recipeId: 'rec_2' }));
    expect(mockedDecline).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('declines without accepting', async () => {
    const user = userEvent.setup();
    mockedDecline.mockResolvedValue({ ok: true });
    renderList();

    await user.click(screen.getAllByRole('button', { name: /decline/i })[0]!);

    await waitFor(() => expect(mockedDecline).toHaveBeenCalledWith({ recipeId: 'rec_1' }));
    expect(mockedAccept).not.toHaveBeenCalled();
  });

  it('reports a failure and does not refresh, so the invite stays answerable', async () => {
    const user = userEvent.setup();
    mockedAccept.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    renderList();

    await user.click(screen.getAllByRole('button', { name: /accept/i })[0]!);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
