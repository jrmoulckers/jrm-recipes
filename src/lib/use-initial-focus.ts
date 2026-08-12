'use client';

import * as React from 'react';

/**
 * Explicit initial-focus helpers, replacing the `autoFocus` attribute (#682).
 *
 * `autoFocus` is flagged by `jsx-a11y/no-autofocus` because it is indiscriminate:
 * the attribute cannot express *why* focus moved, so it reads the same whether a
 * user opened a dialog or a page simply loaded. Only the first is expected.
 * WCAG 2.2 AA treats an unrequested focus change as a change of context, so the
 * distinction is the accessibility question, not a lint technicality.
 *
 * These hooks keep the legitimate half and make it explicit:
 *
 * - `useDialogInitialFocus` — a surface the user deliberately opened. Radix
 *   already moves focus into the dialog; this only redirects it from the default
 *   (the close button) to the first field, which is what a keyboard user wants.
 * - `useFocusOnAttach` — a subtree that appears in response to a user action,
 *   such as an inline editor revealed by a button.
 *
 * Neither is appropriate on page load. Where focus was being taken at load, the
 * fix is to stop taking it rather than to relocate it.
 */

/**
 * Focus a field when a Radix dialog opens.
 *
 * Spread the returned handler onto `DialogContent` and the ref onto the field.
 * If the ref is unset — a conditionally rendered field, say — the handler does
 * nothing and Radix keeps its own focus behaviour, so focus is never stranded
 * outside the dialog.
 */
export function useDialogInitialFocus<T extends HTMLElement = HTMLInputElement>() {
  const ref = React.useRef<T>(null);

  const onOpenAutoFocus = React.useCallback((event: Event) => {
    const node = ref.current;
    if (!node) return;
    event.preventDefault();
    node.focus();
  }, []);

  return { ref, onOpenAutoFocus };
}

/**
 * Focus an element as soon as it attaches to the DOM.
 *
 * A ref callback rather than an effect, because these fields live inside
 * conditionally rendered subtrees: the parent component is already mounted when
 * the field appears, so a mount effect would not fire. The callback is stable,
 * so ordinary re-renders (every keystroke, for a controlled input) do not
 * re-focus and cannot fight the user's cursor.
 */
export function useFocusOnAttach<T extends HTMLElement = HTMLInputElement>() {
  return React.useCallback((node: T | null) => {
    node?.focus();
  }, []);
}
