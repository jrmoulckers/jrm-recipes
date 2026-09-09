import { act, cleanup as cleanupDom, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountBoundCleanup } from './account-bound-cleanup';
import type { AccountBoundOwnerMarkerStore } from '~/lib/account-bound-cleanup';

const { clerk, warning } = vi.hoisted(() => ({
  clerk: {
    state: {
      isLoaded: true,
      userId: 'account-a' as string | null,
    },
    useAuth: vi.fn(),
  },
  warning: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => {
    clerk.useAuth();
    return clerk.state;
  },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { warning } }));

let ownerMarker = 'marker:account-a';
const ownerMarkerStore: AccountBoundOwnerMarkerStore = {
  getItem: vi.fn(() => ownerMarker),
  setItem: vi.fn((_, value) => {
    ownerMarker = value;
  }),
  removeItem: vi.fn(() => {
    ownerMarker = '';
  }),
};
const markerForIdentity = async (identity: string) => `marker:${identity}`;

function cleanupBoundary(cleanup: () => unknown | Promise<unknown>) {
  return (
    <AccountBoundCleanup
      enabled
      cleanup={cleanup}
      ownerMarkerStore={ownerMarkerStore}
      markerForIdentity={markerForIdentity}
    />
  );
}

describe('AccountBoundCleanup', () => {
  beforeEach(() => {
    clerk.state.isLoaded = true;
    clerk.state.userId = 'account-a';
    clerk.useAuth.mockClear();
    warning.mockClear();
    ownerMarker = 'marker:account-a';
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanupDom();
  });

  it('observes live Clerk sign-out and account-switch transitions', async () => {
    const cleanup = vi.fn();
    const view = render(cleanupBoundary(cleanup));

    expect(cleanup).not.toHaveBeenCalled();

    clerk.state.userId = null;
    view.rerender(cleanupBoundary(cleanup));
    await act(async () => Promise.resolve());
    expect(cleanup).toHaveBeenCalledOnce();

    clerk.state.userId = 'account-b';
    view.rerender(cleanupBoundary(cleanup));
    await act(async () => Promise.resolve());
    expect(cleanup).toHaveBeenCalledTimes(2);

    clerk.state.userId = 'account-c';
    view.rerender(cleanupBoundary(cleanup));
    await act(async () => Promise.resolve());
    expect(cleanup).toHaveBeenCalledTimes(3);
  });

  it('ignores loading and unchanged identity states', async () => {
    const cleanup = vi.fn();
    clerk.state.isLoaded = false;
    const view = render(cleanupBoundary(cleanup));

    clerk.state.isLoaded = true;
    view.rerender(cleanupBoundary(cleanup));
    await act(async () => Promise.resolve());

    view.rerender(cleanupBoundary(cleanup));
    await act(async () => Promise.resolve());

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not invoke Clerk hooks when auth is not configured', () => {
    render(<AccountBoundCleanup enabled={false} />);

    expect(clerk.useAuth).not.toHaveBeenCalled();
  });

  it('warns and retries when account-transition cleanup is incomplete', async () => {
    vi.useFakeTimers();
    const cleanup = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        outcomes: [{ id: 'dietary-analysis-storage', status: 'failed' }],
      })
      .mockResolvedValueOnce({ ok: true, outcomes: [] });
    const view = render(cleanupBoundary(cleanup));

    clerk.state.userId = 'account-b';
    view.rerender(cleanupBoundary(cleanup));
    await act(async () => Promise.resolve());

    expect(warning).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
