"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  ActionFailure,
  ActionResult,
  ActionSuccess,
  FieldErrors,
} from "~/server/action-result";

type SuccessToast<T, Args extends unknown[]> =
  | string
  | ((result: ActionSuccess<T>, ...args: Args) => string);

type ErrorToast<Args extends unknown[]> =
  | boolean
  | string
  | ((failure: ActionFailure, ...args: Args) => string);

export type UseServerActionOptions<T, Args extends unknown[]> = {
  /** Runs after a successful result, before the optional `router.refresh()`. */
  onSuccess?: (result: ActionSuccess<T>, ...args: Args) => void;
  /** Runs after a failed result — e.g. to roll back an optimistic update. */
  onError?: (failure: ActionFailure, ...args: Args) => void;
  /** Success toast: a fixed string, or one derived from the result and args. */
  successToast?: SuccessToast<T, Args>;
  /**
   * Error toast. `true` toasts `failure.error`; a string or function overrides
   * the message. Omit to stay silent (handle it via `onError` / the returned
   * `error`).
   */
  errorToast?: ErrorToast<Args>;
  /** Call `router.refresh()` after a successful result. */
  refresh?: boolean;
};

export type UseServerActionReturn<Args extends unknown[]> = {
  /** Invoke the action inside a React transition (fire-and-forget). */
  run: (...args: Args) => void;
  /** True while the action is in flight. */
  pending: boolean;
  /** The last failure message, or `null` after a success / reset. */
  error: string | null;
  /** The last field-level errors, or `null` after a success / reset. */
  fieldErrors: FieldErrors | null;
  /** Clear the retained `error` / `fieldErrors`. */
  reset: () => void;
};

/**
 * Standardize the client-side server-action lifecycle (#198).
 *
 * Client components used to re-implement the same steps for every action: open a
 * `useTransition`, `await` the action, branch on `res.ok`, toast success/error,
 * and sometimes `router.refresh()` — each copy slightly different. This hook owns
 * that plumbing against the shared {@link ActionResult} contract and exposes
 * `error` / `fieldErrors` so form callers get server validation without a bespoke
 * `setErrors` map.
 *
 * Parametrized over the action's success payload `T` so `onSuccess` /
 * `successToast` receive the typed `ActionSuccess<T>`. `run` is fire-and-forget
 * and referentially stable across renders. Next control-flow signals an action
 * may throw (`redirect()`, `notFound()`) are left to propagate untouched.
 */
export function useServerAction<T, Args extends unknown[]>(
  action: (...args: Args) => Promise<ActionResult<T>>,
  options: UseServerActionOptions<T, Args> = {},
): UseServerActionReturn<Args> {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors | null>(null);

  // Keep the latest options without forcing `run` to change identity so callers
  // can safely pass inline option objects each render.
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const reset = React.useCallback(() => {
    setError(null);
    setFieldErrors(null);
  }, []);

  const run = React.useCallback(
    (...args: Args) => {
      startTransition(async () => {
        const opts = optionsRef.current;
        const result = await action(...args);

        if (result.ok) {
          setError(null);
          setFieldErrors(null);
          if (opts.successToast !== undefined) {
            toast.success(
              typeof opts.successToast === "function"
                ? opts.successToast(result, ...args)
                : opts.successToast,
            );
          }
          opts.onSuccess?.(result, ...args);
          if (opts.refresh) router.refresh();
          return;
        }

        setError(result.error);
        setFieldErrors(result.fieldErrors ?? null);
        if (opts.errorToast) {
          toast.error(
            typeof opts.errorToast === "function"
              ? opts.errorToast(result, ...args)
              : typeof opts.errorToast === "string"
                ? opts.errorToast
                : result.error,
          );
        }
        opts.onError?.(result, ...args);
      });
    },
    [action, router],
  );

  return { run, pending, error, fieldErrors, reset };
}