import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * One canonical dismiss / close / remove affordance for the whole app.
 *
 * Before this, every dismissable (toast close, chip remove, photo remove, card
 * dismiss, timer clear…) hand-rolled its own X button with a different size,
 * radius, background and hover, so they never looked like a coherent set. This
 * primitive standardizes all of them: a circular target, the shared
 * `focus-visible` ring, a calm hover, and reduced-motion-safe transitions.
 *
 * Sizing note: the global `button` rule in globals.css floors real buttons to
 * `--tap-min` (44px). That is what we want for the standalone `md`/`lg` corner
 * buttons. The inline `sm` size — used inside chips and pills — instead pins its
 * own 24px box (still ≥ WCAG 2.5.8 AA target size) so it never stretches the row
 * it sits in.
 */
const closeButtonVariants = cva(
  "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full ring-offset-background transition-[background,color,box-shadow,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Transparent until hovered — for use on plain surfaces.
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        // A subtle filled chip — for use inside pills/badges and busy rows.
        soft: "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
        // A raised, legible button — for corners floating over imagery/content.
        overlay:
          "border border-border bg-card/85 text-muted-foreground shadow-token backdrop-blur hover:bg-card hover:text-foreground",
      },
      tone: {
        neutral: "",
        danger: "hover:text-destructive",
      },
      size: {
        // Inline: pins its own 24px box so it never inflates a chip's height.
        sm: "size-6 min-h-6 min-w-6 [&_svg]:size-3.5",
        md: "size-8 [&_svg]:size-4",
        lg: "size-10 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "ghost", tone: "neutral", size: "md" },
  },
);

export interface CloseButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof closeButtonVariants> {
  /**
   * Accessible name for the control (e.g. "Remove photo", "Dismiss"). Required —
   * an icon-only button is invisible to screen readers without it.
   */
  label: string;
}

/**
 * Icon-only dismiss button. Renders an X by default; pass `children` to use a
 * different icon (e.g. a spinner while a remove is pending).
 */
const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  (
    { className, variant, tone, size, label, type, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={props.title ?? label}
      className={cn(closeButtonVariants({ variant, tone, size }), className)}
      {...props}
    >
      {children ?? <X aria-hidden="true" />}
    </button>
  ),
);
CloseButton.displayName = "CloseButton";

export { CloseButton, closeButtonVariants };
