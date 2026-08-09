import { cva, type VariantProps } from "class-variance-authority";

/**
 * The one canonical notification surface for the whole app (issue #647).
 *
 * Every transient, dismissible message the app shows — toasts, the PWA install
 * nudge, the "update available" prompt — used to hand-roll its own card: a
 * different radius, a different shadow, a different background, a different
 * icon treatment. Side by side they read as three unrelated widgets.
 *
 * These variants define the shared shell so all of them are the same object:
 * a floating, blurred popover card with the token elevation, a tone-tinted
 * leading icon badge, a tight title/description pair, and room reserved on the
 * trailing edge for the standard dismiss affordance.
 *
 * The Sonner toaster consumes these through `components/ui/sonner.tsx`; the
 * banners in `components/pwa/*` apply them directly.
 */
export const notificationSurface = cva(
  "pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-token-lg backdrop-blur",
);

/**
 * Leading icon badge. Status tones fill with the semantic token and draw the
 * glyph in that token's paired foreground, so glyph contrast is guaranteed by
 * the theme's own token pairing in every mode and scheme (WCAG 1.4.11). The
 * `brand` tone stays a tint because it backs the multi-color LogoMark, which
 * would clash with a solid fill.
 */
export const notificationIcon = cva(
  "inline-flex shrink-0 items-center justify-center rounded-xl",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        brand: "bg-primary/15 text-primary",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        info: "bg-info text-info-foreground",
        danger: "bg-destructive text-destructive-foreground",
      },
      size: {
        sm: "size-9",
        md: "size-11",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export type NotificationIconProps = VariantProps<typeof notificationIcon>;

/** Title line: short, high-contrast, never competing with page headings. */
export const notificationTitle = "text-sm font-semibold leading-tight";

/** Supporting line: calm, secondary, optional. */
export const notificationDescription =
  "text-xs leading-snug text-muted-foreground";
