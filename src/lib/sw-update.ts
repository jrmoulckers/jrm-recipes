/**
 * Pure helpers for the user-controlled service-worker update flow (#163). Kept
 * free of React and the ServiceWorker DOM APIs so the decision logic can be
 * unit-tested without a browser. The component in
 * `src/components/pwa/update-prompt.tsx` wires these to the real registration.
 */

/**
 * Message posted to a *waiting* service worker to make it activate now. Serwist
 * registers a `message` listener for exactly this payload whenever the worker is
 * built with `skipWaiting: false`, so the newer SW calls `self.skipWaiting()`
 * and takes control (firing `controllerchange` on the client).
 */
export const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

export type SkipWaitingMessage = typeof SKIP_WAITING_MESSAGE;

/**
 * Whether a detected service-worker state should surface the "update available"
 * prompt. We only prompt when the page is already controlled by an active SW
 * (`hasController`) *and* a newer worker is `waiting`: that combination is a
 * genuine update. The very first install has a waiting/installing worker but no
 * controller yet, and prompting then would be noise (nothing to update from).
 */
export function shouldShowUpdatePrompt(options: {
  hasController: boolean;
  hasWaitingWorker: boolean;
}): boolean {
  return options.hasController && options.hasWaitingWorker;
}
