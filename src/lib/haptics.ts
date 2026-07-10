import { prefersReducedMotion } from "~/lib/use-reduced-motion";

/** A single duration in ms, or an on/off vibration pattern (`navigator.vibrate`). */
export type HapticPattern = number | readonly number[];

/**
 * Short, distinct patterns for meaningful tactile moments. Kept intentionally
 * brief so they read as confirmation, not noise.
 */
export const HAPTICS = {
  /** Light tap when advancing/rewinding a cook step or ticking an ingredient. */
  select: 12,
  /** Slightly firmer tap for step navigation. */
  stepNav: 18,
  /** Distinct triple buzz when a timer finishes — noticeable over a fan/tone. */
  timerComplete: [70, 40, 120],
} as const;

/**
 * Fire a haptic pulse (issue #80).
 *
 * - Feature-detected: safely no-ops where `navigator.vibrate` is unavailable
 *   (e.g. iOS Safari) and never throws on the server (`navigator` is guarded).
 * - Respects motion preferences: does nothing when the user has opted out of
 *   motion via OS `prefers-reduced-motion` OR the in-app `data-motion="reduced"`
 *   / Simple mode. The reduced-motion decision is injectable for testing.
 *
 * @returns whether a vibration was actually requested.
 */
export function vibrate(
  pattern: HapticPattern,
  isReduced: () => boolean = prefersReducedMotion,
): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }
  if (isReduced()) return false;

  try {
    // Copy readonly patterns to a mutable array for the DOM signature.
    return navigator.vibrate(
      typeof pattern === "number" ? pattern : [...pattern],
    );
  } catch {
    return false;
  }
}
