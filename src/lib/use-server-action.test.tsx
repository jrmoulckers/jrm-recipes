import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useServerAction } from './use-server-action';
import { IntlWrapper } from '~/test/intl';
import esMessages from '~/messages/es.json';
import type { ActionResult } from '~/server/action-result';

/**
 * Render under the Spanish catalog. Asserting against Spanish proves the copy is
 * actually resolved through the catalog: an English assertion would still pass
 * if the hook fell back to hardcoded strings.
 */
const spanishWrapper = ({ children }: { children: ReactNode }) => (
  <IntlWrapper locale="es" messages={esMessages}>
    {children}
  </IntlWrapper>
);

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('useServerAction (#198)', () => {
  it('runs the action, toasts success, calls onSuccess with args, and refreshes', async () => {
    const action = vi.fn(
      async (_input: { id: string }): Promise<ActionResult<{ slug: string }>> => ({
        ok: true,
        slug: 'sunday-sauce',
      }),
    );
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useServerAction(action, {
          successToast: 'Saved',
          onSuccess,
          refresh: true,
          errorToast: true,
        }),
      { wrapper: IntlWrapper },
    );

    await act(async () => {
      result.current.run({ id: 'r1' });
    });

    expect(action).toHaveBeenCalledWith({ id: 'r1' });
    expect(toastSuccess).toHaveBeenCalledWith('Saved');
    expect(onSuccess).toHaveBeenCalledWith({ ok: true, slug: 'sunday-sauce' }, { id: 'r1' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.fieldErrors).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('derives the success toast from the result and args', async () => {
    const action = vi.fn(async (_v: number): Promise<ActionResult<{ favorited: boolean }>> => ({
      ok: true,
      favorited: false,
    }));

    const { result } = renderHook(
      () =>
        useServerAction(action, {
          successToast: (res) => (res.favorited ? 'Saved.' : 'Removed.'),
        }),
      { wrapper: IntlWrapper },
    );

    await act(async () => {
      result.current.run(1);
    });

    expect(toastSuccess).toHaveBeenCalledWith('Removed.');
  });

  it('exposes error + fieldErrors, toasts the error, and calls onError on failure', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: { title: ['Title is required.'] },
    }));
    const onError = vi.fn();

    const { result } = renderHook(
      () => useServerAction(action, { errorToast: true, onError, refresh: true }),
      { wrapper: IntlWrapper },
    );

    await act(async () => {
      result.current.run();
    });

    expect(result.current.error).toBe('Please fix the highlighted fields.');
    expect(result.current.fieldErrors).toEqual({
      title: ['Title is required.'],
    });
    expect(toastError).toHaveBeenCalledWith('Please fix the highlighted fields.');
    expect(onError).toHaveBeenCalledTimes(1);
    // No success side effects on failure.
    expect(refresh).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('stays silent when errorToast is not set, but still exposes the error', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      error: 'Nope',
    }));

    const { result } = renderHook(() => useServerAction(action), {
      wrapper: IntlWrapper,
    });

    await act(async () => {
      result.current.run();
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Nope');

    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
    expect(result.current.fieldErrors).toBeNull();
  });

  it("resolves a known error code through the active locale's catalog", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      error: 'RATE_LIMITED',
    }));

    const { result } = renderHook(() => useServerAction(action, { errorToast: true }), {
      wrapper: spanishWrapper,
    });

    await act(async () => {
      result.current.run();
    });

    expect(toastError).toHaveBeenCalledWith(esMessages.errors.RATE_LIMITED);
    // The raw code is never shown, and the English copy is not used.
    expect(toastError).not.toHaveBeenCalledWith('RATE_LIMITED');
  });

  it('uses the localized offline copy when the browser is offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      error: 'NETWORK',
    }));

    const { result } = renderHook(() => useServerAction(action, { errorToast: true }), {
      wrapper: spanishWrapper,
    });

    await act(async () => {
      result.current.run();
    });

    expect(toastError).toHaveBeenCalledWith(esMessages.pwa.connectivity.actionBlocked);
    onLine.mockRestore();
  });
});
