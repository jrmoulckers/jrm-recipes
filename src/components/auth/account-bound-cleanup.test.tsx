import { act, cleanup as cleanupDom, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountBoundCleanup } from './account-bound-cleanup';

const clerk = vi.hoisted(() => ({
  state: {
    isLoaded: true,
    userId: 'account-a' as string | null,
  },
  useAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => {
    clerk.useAuth();
    return clerk.state;
  },
}));

describe('AccountBoundCleanup', () => {
  beforeEach(() => {
    clerk.state.isLoaded = true;
    clerk.state.userId = 'account-a';
    clerk.useAuth.mockClear();
  });

  afterEach(() => {
    cleanupDom();
  });

  it('observes live Clerk sign-out and account-switch transitions', async () => {
    const cleanup = vi.fn();
    const view = render(<AccountBoundCleanup enabled cleanup={cleanup} />);

    expect(cleanup).not.toHaveBeenCalled();

    clerk.state.userId = null;
    view.rerender(<AccountBoundCleanup enabled cleanup={cleanup} />);
    await act(async () => Promise.resolve());
    expect(cleanup).toHaveBeenCalledOnce();

    clerk.state.userId = 'account-b';
    view.rerender(<AccountBoundCleanup enabled cleanup={cleanup} />);
    await act(async () => Promise.resolve());
    expect(cleanup).toHaveBeenCalledOnce();

    clerk.state.userId = 'account-c';
    view.rerender(<AccountBoundCleanup enabled cleanup={cleanup} />);
    await act(async () => Promise.resolve());
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('ignores loading and unchanged identity states', async () => {
    const cleanup = vi.fn();
    clerk.state.isLoaded = false;
    const view = render(<AccountBoundCleanup enabled cleanup={cleanup} />);

    clerk.state.isLoaded = true;
    view.rerender(<AccountBoundCleanup enabled cleanup={cleanup} />);
    await act(async () => Promise.resolve());

    view.rerender(<AccountBoundCleanup enabled cleanup={cleanup} />);
    await act(async () => Promise.resolve());

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not invoke Clerk hooks when auth is not configured', () => {
    render(<AccountBoundCleanup enabled={false} />);

    expect(clerk.useAuth).not.toHaveBeenCalled();
  });
});
