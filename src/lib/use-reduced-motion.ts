"use client";

import * as React from "react";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Resolve the *effective* reduced-motion state from the live OS media query plus
 * the `<html>` data-attributes the {@link A11yProvider} maintains. Mirrors the
 * CSS contract in globals.css / a11y.css exactly so JS-driven motion never
 * disagrees with what the stylesheet is already doing:
 *
 *   • Simple / `barebones` mode (`data-theme="barebones"`, `--motion-scale: 0`)
 *     → reduced.
 *   • Explicit in-app reduce (`data-motion="reduced"`) → reduced.
 *   • Explicit in-app opt-out (`data-motion="off"`) → NOT reduced, beating the OS
 *     (matches `:root:not([data-motion="off"])` gating in the CSS).
 *   • Otherwise follow the OS `prefers-reduced-motion`.
 */
function computeReduced(osReduced: boolean): boolean {
  if (typeof document === "undefined") return osReduced;
  const { motion, theme } = document.documentElement.dataset;
  if (theme === "barebones") return true;
  if (motion === "reduced") return true;
  if (motion === "off") return false;
  return osReduced;
}

/**
 * The single source of truth for JavaScript-driven motion (issue #110).
 *
 * Unlike a bare `matchMedia("(prefers-reduced-motion: reduce)")` check, this
 * also honors the app's own reduced-motion controls — the a11y "Reduced motion"
 * toggle (`data-motion="reduced"`) and Simple mode (`data-theme="barebones"`) —
 * so canvas previews, swipe drags, haptics, count-rolls and celebrations all
 * stay in lockstep with the CSS that globals.css / a11y.css already gate.
 *
 * SSR-safe: returns `false` on the server and first client paint, then
 * reconciles after mount. Reactive to both the media-query `change` event and
 * live edits to the `data-motion` / `data-theme` attributes.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOTION_QUERY);
    const sync = () => setReduced(computeReduced(mql.matches));
    sync();

    mql.addEventListener("change", sync);
    // The in-app toggle and Simple mode flip <html> data-attributes; observe
    // them so the hook updates the instant a user changes a setting.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion", "data-theme"],
    });

    return () => {
      mql.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}

/**
 * Imperative, non-reactive read of the *effective* reduced-motion state, for use
 * in event handlers and one-shot side effects (e.g. {@link vibrate} haptics)
 * where a hook isn't appropriate. Mirrors {@link useReducedMotion} and the
 * globals.css / a11y.css contract. SSR-safe: returns `false` when there is no
 * `window`/`matchMedia`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return computeReduced(window.matchMedia(MOTION_QUERY).matches);
}
