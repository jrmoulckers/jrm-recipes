import * as React from "react";

import { cn } from "~/lib/utils";

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  /**
   * Accessible label. When provided the spinner is announced as a live status;
   * when omitted it is treated as decorative (`aria-hidden`) — e.g. inside a
   * Button that already sets `aria-busy`.
   */
  label?: string;
}

/**
 * Token-driven loading indicator (issue #82). Sized in `em` so it inherits the
 * surrounding text size, painted with `currentColor` so it adopts the parent's
 * semantic colour, and animated with `animate-spin` — which the global
 * reduced-motion + Simple-mode rules (globals.css / a11y.css) stop, so it never
 * spins infinitely when motion is off.
 */
const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, label, ...props }, ref) => {
    const a11y = label
      ? ({ role: "status", "aria-label": label } as const)
      : ({ "aria-hidden": true } as const);
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          "size-[1em] shrink-0 animate-spin text-current",
          className,
        )}
        {...a11y}
        {...props}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-90"
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  },
);
Spinner.displayName = "Spinner";

export { Spinner };
