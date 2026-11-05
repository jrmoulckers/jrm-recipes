import type { ReactElement } from 'react';
import Link from 'next/link';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '~/server/action-result';
import { followUserAction, unfollowUserAction } from '~/server/follows/actions';
import { IntlWrapper } from '~/test/intl';
import { FollowButton } from './follow-button';

const auth = vi.hoisted(() => ({
  isLoaded: true,
  userId: null as string | null,
  openSignIn: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@clerk/nextjs', async () => {
  const { cloneElement } = await import('react');
  return {
    useAuth: () => ({ isLoaded: auth.isLoaded, userId: auth.userId }),
    SignInButton: ({
      children,
      mode,
    }: {
      children: ReactElement<{ onClick: () => void }>;
      mode: string;
    }) => cloneElement(children, { onClick: () => auth.openSignIn(mode) }),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => auth }));
vi.mock('~/server/follows/actions', () => ({
  followUserAction: vi.fn(),
  unfollowUserAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function profile({
  signedIn = false,
  authConfigured = true,
  initialFollowing = false,
}: {
  signedIn?: boolean;
  authConfigured?: boolean;
  initialFollowing?: boolean;
} = {}) {
  return (
    <IntlWrapper>
      <h1>Public fixture cook</h1>
      <Link href="/recipes/fixture-cook/family-recipe">Family recipe</Link>
      <FollowButton
        followeeId="fixture-cook"
        initialFollowing={initialFollowing}
        signedIn={signedIn}
        authConfigured={authConfigured}
      />
    </IntlWrapper>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.isLoaded = true;
  auth.userId = null;
  vi.mocked(followUserAction).mockResolvedValue({ ok: true });
  vi.mocked(unfollowUserAction).mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('guest follow recovery (#1202)', () => {
  it.each([false, true])(
    'opens modal sign-in without a mutation or losing the profile (initial following: %s)',
    async (initialFollowing) => {
      const user = userEvent.setup();
      const view = render(profile({ initialFollowing }));
      const button = screen.getByRole('button', { name: 'Follow' });
      await user.click(button);
      button.focus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      expect(auth.openSignIn).toHaveBeenCalledTimes(3);
      expect(auth.openSignIn).toHaveBeenCalledWith('modal');
      expect(followUserAction).not.toHaveBeenCalled();
      expect(unfollowUserAction).not.toHaveBeenCalled();
      expect(button).not.toHaveAttribute('aria-pressed');
      expect(screen.getByRole('heading', { name: 'Public fixture cook' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Family recipe' })).toBeVisible();

      auth.userId = 'signed-in-clerk-user';
      view.rerender(profile({ initialFollowing }));
      await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
      expect(followUserAction).not.toHaveBeenCalled();
      expect(unfollowUserAction).not.toHaveBeenCalled();
      view.rerender(profile({ signedIn: true }));
      await user.click(screen.getByRole('button', { name: 'Follow' }));
      await waitFor(() => {
        expect(followUserAction).toHaveBeenCalledWith({ followeeId: 'fixture-cook' });
        expect(screen.getByRole('button', { name: 'Following' })).toBeEnabled();
      });
    },
  );

  it('waits for Clerk to load and stays inert when Clerk is unconfigured', async () => {
    const user = userEvent.setup();
    auth.isLoaded = false;
    const view = render(profile());
    await user.click(screen.getByRole('button', { name: 'Follow' }));
    expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled();
    auth.isLoaded = true;
    view.rerender(profile({ authConfigured: false }));
    await user.click(screen.getByRole('button', { name: 'Follow' }));
    expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled();
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(followUserAction).not.toHaveBeenCalled();
    expect(unfollowUserAction).not.toHaveBeenCalled();
  });
});

describe('authenticated follow controls (#1202)', () => {
  it.each([false, true])(
    'preserves optimism, pending disablement, and rollback (initial following: %s)',
    async (initialFollowing) => {
      const user = userEvent.setup();
      let finish!: (result: ActionResult) => void;
      const response = new Promise<ActionResult>((resolve) => {
        finish = resolve;
      });
      const action = initialFollowing ? unfollowUserAction : followUserAction;
      vi.mocked(action).mockReturnValueOnce(response);
      render(profile({ signedIn: true, authConfigured: false, initialFollowing }));
      await user.click(
        screen.getByRole('button', {
          name: initialFollowing ? 'Following' : 'Follow',
        }),
      );
      const button = screen.getByRole('button', {
        name: initialFollowing ? 'Follow' : 'Following',
      });
      expect(button).toHaveAttribute('aria-pressed', String(!initialFollowing));
      expect(button).toBeDisabled();
      await user.click(button);
      expect(action).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledWith({ followeeId: 'fixture-cook' });
      await act(async () => finish({ ok: false, error: 'Could not update follow.' }));
      await waitFor(() => {
        expect(button).toBeEnabled();
        expect(button).toHaveAttribute('aria-pressed', String(initialFollowing));
      });
      expect(auth.openSignIn).not.toHaveBeenCalled();
    },
  );

  it('keeps successful follow and unfollow state', async () => {
    const user = userEvent.setup();
    render(profile({ signedIn: true }));
    await user.click(screen.getByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Following' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Following' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow' })).toBeEnabled());
    expect(followUserAction).toHaveBeenCalledTimes(1);
    expect(unfollowUserAction).toHaveBeenCalledTimes(1);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });
});
