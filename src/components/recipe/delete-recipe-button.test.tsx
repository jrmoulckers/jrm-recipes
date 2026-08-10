import { cleanup, render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeleteRecipeButton } from './delete-recipe-button';
import { redirect } from 'next/navigation';
import { ConfirmProvider } from '~/components/ui/confirm-dialog';
import { deleteRecipeAction, restoreRecipeAction } from '~/server/recipes/actions';
import React, { Component, type ReactElement, type ReactNode } from 'react';
import { IntlWrapper } from '~/test/intl';

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

/**
 * Build the `NEXT_REDIRECT` error Next rejects an action promise with when the
 * server action redirects (issue #648).
 */
function makeRedirectError(): unknown {
  try {
    redirect('/recipes');
  } catch (error) {
    return error;
  }
  throw new Error('redirect() did not throw');
}

const caughtByBoundary: { digest?: string }[] = [];

/** Stands in for Next's `RedirectBoundary`, which handles the rethrown error. */
class CatchBoundary extends Component<{ children: ReactNode }> {
  static getDerivedStateFromError() {
    return {};
  }
  override componentDidCatch(error: unknown) {
    caughtByBoundary.push(error as { digest?: string });
  }
  override render() {
    return this.props.children;
  }
}

vi.mock('~/server/recipes/actions', () => ({
  deleteRecipeAction: vi.fn<(id: string) => Promise<void>>(),
  restoreRecipeAction: vi.fn<(id: string) => Promise<boolean>>(),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRouter: () => ({ push, refresh }) };
});

const toastFn = vi.fn((_message?: unknown, _options?: unknown) => 'toast-1');
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastDismiss = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign((message?: unknown, options?: unknown) => toastFn(message, options), {
    success: (m: string) => {
      toastSuccess(m);
    },
    error: (m: string) => {
      toastError(m);
    },
    dismiss: (id: unknown) => {
      toastDismiss(id);
    },
  }),
}));

const mockedDelete = vi.mocked(deleteRecipeAction);
const mockedRestore = vi.mocked(restoreRecipeAction);

afterEach(() => {
  cleanup();
  caughtByBoundary.length = 0;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderButton() {
  return render(
    <CatchBoundary>
      <ConfirmProvider>
        <DeleteRecipeButton id="r1" slug="nanas-pie" title="Nana's pie" />
      </ConfirmProvider>
    </CatchBoundary>,
  );
}

describe('DeleteRecipeButton (#427)', () => {
  it('does nothing when the confirm is dismissed', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockedDelete).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('soft-deletes and offers an undo toast on confirm', async () => {
    const user = userEvent.setup();
    mockedDelete.mockResolvedValue(undefined);
    renderButton();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: 'Delete recipe' }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('r1'));
    // The undo affordance is offered optimistically.
    expect(toastFn).toHaveBeenCalledTimes(1);
    const opts = toastFn.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void };
    };
    expect(opts.action.label).toBe('Undo');
  });

  it('restores the recipe and navigates back when Undo is invoked', async () => {
    const user = userEvent.setup();
    mockedDelete.mockResolvedValue(undefined);
    mockedRestore.mockResolvedValue(true);
    renderButton();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: 'Delete recipe' }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    const opts = toastFn.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void };
    };
    opts.action.onClick();

    await waitFor(() => expect(mockedRestore).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes/nanas-pie'));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('surfaces an error and dismisses the toast when delete fails', async () => {
    const user = userEvent.setup();
    mockedDelete.mockRejectedValue(new Error('boom'));
    renderButton();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: 'Delete recipe' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastDismiss).toHaveBeenCalledWith('toast-1');
  });

  // A successful delete redirects to /recipes, and Next signals that by
  // rejecting the action promise with a NEXT_REDIRECT error (issue #648). The
  // button must hand it back to Next's redirect boundary instead of reporting a
  // delete failure the owner never had.
  it('keeps the undo toast when the action redirects after a successful delete', async () => {
    const user = userEvent.setup();
    mockedDelete.mockRejectedValue(makeRedirectError());
    renderButton();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: 'Delete recipe' }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(caughtByBoundary).toHaveLength(1));
    expect(caughtByBoundary[0]).toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT') as string,
    });
    expect(toastError).not.toHaveBeenCalled();
    expect(toastDismiss).not.toHaveBeenCalled();
  });
});
