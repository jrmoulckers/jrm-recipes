import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { DeleteAccountPanel } from './delete-account-panel';
import type { DeletionPreview } from '~/server/users/deletion-preview';

const { cleanupAccountBoundClientData, deleteAccountAction } = vi.hoisted(() => ({
  cleanupAccountBoundClientData: vi.fn(),
  deleteAccountAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('~/server/users/actions', () => ({
  deleteAccountAction,
}));

vi.mock('~/lib/account-bound-cleanup', () => ({
  cleanupAccountBoundClientData,
}));

const BASE: DeletionPreview = {
  ownedRecipeCount: 3,
  deletedOwnedRecipeCount: 3,
  unclaimedRecipeCount: 0,
  coCreatedRecipeCount: 0,
  deletedSharedRecipeCount: 0,
  pendingInviteCount: 0,
  retainedVersionCount: 0,
  retainedMediaCount: 0,
  cookLogEntryCount: 0,
  reviewCount: 0,
  collectionCount: 0,
  soleOwnerGroups: [],
  hasActiveSubscription: false,
};

function renderPanel(preview: Partial<DeletionPreview>) {
  return render(
    <IntlWrapper>
      <DeleteAccountPanel preview={{ ...BASE, ...preview }} />
    </IntlWrapper>,
  );
}

beforeEach(() => {
  deleteAccountAction.mockReset();
  cleanupAccountBoundClientData.mockReset();
});

afterEach(cleanup);

/** The confirm help and CTA only exist once the two-step reveal is open. */
function openConfirmStep() {
  fireEvent.click(screen.getByRole('button', { name: /delete account and personal profile/i }));
}

describe('DeleteAccountPanel shared-content disclosure', () => {
  it('describes account/profile deletion without promising all shared content is erased', () => {
    renderPanel({});
    expect(screen.getByRole('heading', { name: /^Here's exactly what happens$/ })).toBeTruthy();
    expect(screen.getByText(/contributions accepted into shared recipes may remain/i)).toBeTruthy();
    expect(screen.queryByText(/everything in it has been deleted/i)).toBeNull();
  });

  it('explains that owned shared recipes become unclaimed', () => {
    renderPanel({
      ownedRecipeCount: 3,
      deletedOwnedRecipeCount: 1,
      unclaimedRecipeCount: 2,
    });

    expect(screen.getByText(/2 recipes with other accepted contributors remain/i)).toBeTruthy();
    expect(screen.getByText(/nobody is forced to own them/i)).toBeTruthy();
  });

  it('discloses retained history and media before confirmation', () => {
    renderPanel({
      coCreatedRecipeCount: 2,
      retainedVersionCount: 4,
      retainedMediaCount: 3,
    });

    expect(
      screen.getByText(/4 version-history entries remain as “Unknown contributor.”/i),
    ).toBeTruthy();
    expect(screen.getByText(/3 uploaded media items remain/i)).toBeTruthy();
    expect(screen.getByText(/may still identify you/i)).toBeTruthy();
  });

  it('keeps the final confirmation scoped to account and profile deletion', () => {
    renderPanel({ coCreatedRecipeCount: 1, retainedVersionCount: 1 });
    openConfirmStep();

    expect(screen.getByText(/shared content remains only as described above/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /delete account and personal profile/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /permanently delete everything/i })).toBeNull();
  });

  it('purges account-bound browser data after deletion completes', async () => {
    deleteAccountAction.mockResolvedValue({ ok: true });
    cleanupAccountBoundClientData.mockResolvedValue(undefined);
    renderPanel({});
    openConfirmStep();

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^delete account and personal profile$/i }));

    await waitFor(() => expect(cleanupAccountBoundClientData).toHaveBeenCalledOnce());
  });

  it('keeps account-bound browser data when deletion fails', async () => {
    deleteAccountAction.mockResolvedValue({ ok: false, error: 'Try again.' });
    renderPanel({});
    openConfirmStep();

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^delete account and personal profile$/i }));

    await waitFor(() => expect(deleteAccountAction).toHaveBeenCalledOnce());
    expect(cleanupAccountBoundClientData).not.toHaveBeenCalled();
  });
});
