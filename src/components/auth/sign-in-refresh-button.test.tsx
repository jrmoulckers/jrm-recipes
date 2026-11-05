import { cloneElement, type ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInRefreshButton } from './sign-in-refresh-button';

const state = vi.hoisted(() => ({
  isLoaded: false,
  userId: null as string | null,
  refresh: vi.fn(),
  openSignIn: vi.fn(),
}));

vi.mock('next/navigation', () => {
  const router = { refresh: state.refresh };
  return { useRouter: () => router };
});
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: state.isLoaded, userId: state.userId }),
  SignInButton: ({
    children,
    mode,
  }: {
    children: ReactElement<{ onClick?: () => void }>;
    mode: string;
  }) => cloneElement(children, { onClick: () => state.openSignIn(mode) }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.isLoaded = false;
  state.userId = null;
});
afterEach(cleanup);

describe('shared modal sign-in action', () => {
  it('waits for Clerk, opens its modal, and refreshes the server state after sign-in', async () => {
    const user = userEvent.setup();
    const view = render(
      <SignInRefreshButton className="fixture-class" title="Sign in to follow">
        Sign in
      </SignInRefreshButton>,
    );
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toHaveClass('fixture-class');
    expect(button).toHaveAttribute('title', 'Sign in to follow');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(state.openSignIn).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();

    state.isLoaded = true;
    view.rerender(<SignInRefreshButton>Sign in</SignInRefreshButton>);
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(state.openSignIn).toHaveBeenCalledExactlyOnceWith('modal');
    expect(state.refresh).not.toHaveBeenCalled();

    state.userId = 'signed-in-user';
    view.rerender(<SignInRefreshButton>Sign in</SignInRefreshButton>);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    view.rerender(<SignInRefreshButton>Sign in</SignInRefreshButton>);
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });
});
