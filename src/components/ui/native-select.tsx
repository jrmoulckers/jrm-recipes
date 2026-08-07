import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "~/lib/utils";

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Class applied to the positioning wrapper (which owns the chevron). Defaults
   * to `w-full` for the common form case. Pass `w-auto` (or a fixed width) for
   * compact inline selects such as filter bars.
   */
  wrapperClassName?: string;
}

/**
 * Standardized native `<select>` control (#UI-overhaul).
 *
 * Some surfaces deliberately use a native select instead of the Radix
 * {@link Select} popover. Most notably the recipe editor, where iOS Safari
 * zooms the viewport for any focused control rendered below 16px and never
 * zooms back out. This primitive is the single source of truth for that
 * pattern: it mirrors the {@link Input}/{@link Textarea} look
 * (`h-11 rounded-lg border-input bg-background shadow-token-sm`) and keeps
 * `text-base` on mobile, dropping to compact `text-sm` only from `md` up, so
 * the iOS zoom guard holds and the trigger stays a 44px touch target.
 *
 * The native chevron is hidden (`appearance-none`) and replaced with a
 * token-colored {@link ChevronDown} so it matches the Radix Select trigger.
 * `aria-invalid="true"` paints the destructive border + focus ring exactly like
 * the other field primitives.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => {
    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            "flex h-11 w-full appearance-none rounded-lg border border-input bg-background py-2 pe-10 ps-3.5 text-base shadow-token-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            // Invalid state (aria-invalid="true") paints a destructive border and
            // focus ring so the error is visible, not just announced.
            "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 opacity-60"
          aria-hidden="true"
        />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
