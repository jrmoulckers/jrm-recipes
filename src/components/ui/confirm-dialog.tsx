'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { ConfirmContext, type ConfirmOptions, useConfirm } from './confirm-dialog-context';

type Resolver = (confirmed: boolean) => void;

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
  const t = useTranslations('common');
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<Resolver | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (options !== null || openerRef.current === null) return;
    const opener = openerRef.current;
    openerRef.current = null;
    opener.focus();
  }, [options]);

  const settle = React.useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = React.useCallback((next: ConfirmOptions) => {
    // A second request while one is open would orphan the first promise and
    // leave its caller awaiting forever, so decline the pending one first.
    resolverRef.current?.(false);
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
                <AlertDialogDescription>{options.description}</AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {options.cancelLabel ?? t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                destructive={options.destructive ?? true}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export { useConfirm };
export type { ConfirmOptions };
