'use client';

import * as React from 'react';

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

export const ConfirmContext = React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function useConfirm() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return confirm;
}
