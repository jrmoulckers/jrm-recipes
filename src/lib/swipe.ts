/**
 * Pure gesture math for one-handed Cook Mode navigation (issue #400). Kept
 * framework-free so the tap-zone and swipe logic is unit-testable without a DOM.
 */

export type NavDirection = "next" | "previous";

export type SwipeOptions = {
  /** Minimum horizontal travel (px) before a drag counts as a swipe. */
  threshold?: number;
};

const DEFAULT_SWIPE_THRESHOLD = 48;

/**
 * Classify a horizontal swipe from its total delta. A right-to-left swipe
 * (negative dx) means "next"; left-to-right (positive dx) means "previous".
 * Returns null when the gesture is too short or more vertical than horizontal,
 * so scrolling the step never flips to another one.
 */
export function resolveSwipe(
  dx: number,
  dy: number,
  options: SwipeOptions = {},
): NavDirection | null {
  const threshold = options.threshold ?? DEFAULT_SWIPE_THRESHOLD;
  if (Math.abs(dx) < threshold) return null;
  // Must be clearly horizontal — a diagonal scroll shouldn't navigate.
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "next" : "previous";
}

/**
 * Which navigation a tap at `clientX` maps to, given the target element's left
 * edge and width: the left third → previous, the right third → next, and the
 * dead middle third → null so a tap aimed at the instruction text (or a
 * selection) never jumps a step.
 */
export function resolveTapZone(
  clientX: number,
  left: number,
  width: number,
): NavDirection | null {
  if (width <= 0) return null;
  const ratio = (clientX - left) / width;
  if (ratio <= 1 / 3) return "previous";
  if (ratio >= 2 / 3) return "next";
  return null;
}
