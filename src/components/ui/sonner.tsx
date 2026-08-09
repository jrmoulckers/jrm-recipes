"use client";

import { useTheme } from "~/components/theme/theme-provider";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * App-wide toast host, themed to match the active color scheme.
 *
 * Configuration lives here, not at the mount site, so every toast in the app is
 * the same object: same placement, same duration, same dismiss affordance.
 * Passing `richColors` from the call site is what let toasts drift into a
 * full-bleed tinted slab that matched nothing else in the UI. Tone is carried
 * by a tinted leading icon badge on the shared notification surface instead.
 *
 * The visual treatment lives in the `[data-sonner-toast]` block in
 * `styles/globals.css` rather than in `toastOptions.classNames`. Sonner ships
 * its own stylesheet keyed on `[data-sonner-toast]`, so overriding it from here
 * meant stacking `group-[.toaster]:` prefixes on every utility purely to win a
 * specificity fight. Plain token-driven CSS with a known-higher selector says
 * the same thing once, and can also reach the parts Sonner exposes only as CSS
 * custom properties (toast width, close-button placement).
 */
export function Toaster(props: ToasterProps) {
  const { resolvedScheme } = useTheme();
  return (
    <Sonner
      theme={resolvedScheme}
      position="top-center"
      className="toaster group"
      // A keyboard-reachable dismiss affordance on every toast so error messages
      // (which should linger) can be closed on demand instead of only timing out.
      closeButton
      // Give feedback long enough to read. Errors typically linger longer than
      // this default and callers can still override per-toast.
      duration={5000}
      {...props}
    />
  );
}
