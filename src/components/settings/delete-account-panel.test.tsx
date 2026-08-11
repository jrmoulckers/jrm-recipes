import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { DeleteAccountPanel } from './delete-account-panel';
import type { DeletionPreview } from '~/server/users/deletion-preview';

/**
 * The notice must not promise an erasure that will be held (#787).
 *
 * PR #691 shipped a notice whose confirm step says "everything above is deleted
 * immediately", and #770 then made erasure *halt* for entangled accounts. For
 * the users in that intersection every promise on the screen was false at the
 * moment it was shown: nothing was deleted, and the account stayed whole.
 *
 * These render the real catalog through {@link IntlWrapper} rather than
 * asserting on message keys, because the defect was never in the keys — it was
 * that the true sentences were shown to the wrong user. A test against `t(...)`
 * call sites would have passed throughout.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('~/server/users/actions', () => ({
  deleteAccountAction: vi.fn(),
}));

const BASE: DeletionPreview = {
  ownedRecipeCount: 3,
  coCreatedRecipeCount: 0,
  pendingInviteCount: 0,
  heldRecipeCount: 0,
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

afterEach(cleanup);

/** The confirm help and CTA only exist once the two-step reveal is open. */
function openConfirmStep() {
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
}

describe('DeleteAccountPanel held disclosure', () => {
  it('says nothing about a hold for an ordinary account', () => {
    renderPanel({ heldRecipeCount: 0 });
    expect(screen.queryByText(/can't finish this deletion yet/i)).toBeNull();

    openConfirmStep();
    expect(screen.getByText(/everything above is deleted immediately/i)).toBeTruthy();
  });

  it('warns before the confirm step when the erasure will be held', () => {
    renderPanel({ heldRecipeCount: 2 });

    expect(screen.getByText(/can't finish this deletion yet/i)).toBeTruthy();
    expect(screen.getByText(/You share 2 recipes/)).toBeTruthy();
    // The disclosure has to precede the control, not explain the outcome after
    // the fact. The confirm step is still closed here, so a warning visible now
    // is a warning the user meets before deciding.
    expect(screen.getByText(/delete nothing today/i)).toBeTruthy();
  });

  it('stops promising an immediate deletion once a hold is certain', () => {
    renderPanel({ heldRecipeCount: 1 });
    openConfirmStep();

    expect(screen.queryByText(/everything above is deleted immediately/i)).toBe(null);
    expect(screen.getByText(/Pressing the button records your request/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /send my deletion request/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /permanently delete everything/i })).toBeNull();
  });

  /**
   * #830. #792 fixed every element describing the *action* (CTA, confirm help,
   * toast severity) and none describing the *outcome*, so a held user read "All
   * 3 of your recipes are permanently deleted" under a heading promising exactly
   * what happens, then "your recipes and your photos all stay exactly as they
   * are" below it.
   *
   * The list is left untouched deliberately: those sentences are true of the
   * erasure, just not of today. What makes them true is that the hold notice and
   * a conditional heading are read *first*, so ordering is the fix and ordering
   * is what these pin.
   */
  it('frames the outcome list as conditional when the erasure will be held', () => {
    renderPanel({ heldRecipeCount: 2 });

    expect(screen.getByRole('heading', { name: /once we can finish this/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Here's exactly what happens$/ })).toBeNull();
  });

  it('puts the hold notice ahead of the outcomes it qualifies', () => {
    renderPanel({ heldRecipeCount: 2 });

    const heldNotice = screen.getByText(/delete nothing today/i);
    const heading = screen.getByRole('heading', { name: /once we can finish this/i });
    const outcome = screen.getByText(/permanently deleted/i);

    // Both of these would pass if the notice merely existed somewhere on the
    // page, which is exactly the state #792 shipped. Position is the assertion.
    expect(
      heldNotice.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      heldNotice.compareDocumentPosition(outcome) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('leaves the plain heading and ordering alone for an ordinary account', () => {
    renderPanel({ heldRecipeCount: 0 });

    expect(screen.getByRole('heading', { name: /^Here's exactly what happens$/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /once we can finish this/i })).toBeNull();
    expect(screen.getByText(/permanently deleted/i)).toBeTruthy();
  });
});
