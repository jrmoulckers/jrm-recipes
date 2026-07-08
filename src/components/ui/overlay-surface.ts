/**
 * Shared overlay-surface convention (issue #104).
 *
 * Every floating surface in the system — Dialog, DropdownMenu, Select, Popover —
 * uses the same chrome so the family reads as one coherent set: identical
 * radius, border, popover fill, foreground, and elevation. Only the *internal
 * padding* changes, and it does so along a documented scale keyed by the
 * surface's density (see `OVERLAY_PADDING`).
 */
export const OVERLAY_SURFACE =
  "rounded-xl border border-border bg-popover text-popover-foreground shadow-token-lg";

/** Padding scale for overlay surfaces, keyed by density. */
export const OVERLAY_PADDING = {
  /** Item lists (dropdown, select) — tight; the items carry their own padding. */
  menu: "p-1.5",
  /** Free-form popovers. */
  popover: "p-4",
  /** Modal dialogs — roomy, with a comfortable measure. */
  dialog: "p-6",
} as const;
