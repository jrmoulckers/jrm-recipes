"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

export interface ConfirmOptions {
  /** Verb + what's affected. "Delete this recipe?" */
  title: string;
  /** Consequence, then reversibility. Two short sentences at most. */
  description?: string;
  /** Defaults to "Delete". Always a verb, never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the action as destructive. Defaults to true. */
  destructive?: boolean;
}

type Resolver = (confirmed: boolean) => void;

const ConfirmContext = React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

/**
 * Promise-based replacement for `window.confirm()` (#copy-standard).
 *
 * The native prompt could not be styled or translated, so every destructive
 * confirmation rendered in English no matter which of our four locales the
 * reader had chosen. This keeps the same imperative shape at the call site,
 * `const ok = await confirm({...})`, so migrating a call site does not mean
 * restructuring the surrounding handler into declarative open state.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<Resolver | null>(null);

  const settle = React.useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = React.useCallback((next: ConfirmOptions) => {
    // A second request while one is open would orphan the first promise and
    // leave its caller awaiting forever, so decline the pending one first.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        {options ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description ? (
                <AlertDialogDescription>
                  {options.description}
                </AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {options.cancelLabel ?? "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                destructive={options.destructive ?? true}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return confirm;
}
