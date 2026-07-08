/**
 * Connectivity status microcopy (#141).
 *
 * Heirloom is offline-first, so the in-session connection moments deserve calm,
 * non-alarming words that match the `/~offline` page's "the kitchen never closes"
 * tone. All connectivity strings live here so they stay consistent wherever
 * they're shown (transition toasts, the Cook Mode cached badge, blocked actions).
 */

export const CONNECTIVITY_COPY = {
  /** Shown when the network drops mid-session. */
  offline:
    "You're offline — recipes you've opened still work. We'll sync changes when you're back.",
  /** Shown when the connection returns; auto-dismissed. */
  online: "Back online — syncing your latest.",
  /** Cook Mode "offline-ready" affordance near the wake-lock badge. */
  cachedBadge: "Saved for offline",
  cachedTooltip:
    "This recipe is cached — you can finish cooking even without a connection.",
  /** Friendlier copy than a raw failure when a network-only action is attempted offline. */
  actionBlocked:
    "Can't save while offline. We'll keep your changes and try again when you reconnect.",
} as const;

/** True when the browser reports it is offline (safe during SSR). */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
