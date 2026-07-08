"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * Live character counter for length-limited fields (#144).
 *
 * Stays quiet until the value is within `threshold` (default 90%) of `max`, then
 * announces how much room is left — flipping to the destructive token and the
 * field's real validation message once over. `aria-live="polite"` means screen
 * readers hear the warning as the user types, without interrupting.
 *
 * `max` and `overMessage` are passed straight from the Zod schema so the wording
 * and limit never drift from what the server enforces.
 */
export function CharacterCounter({
  value,
  max,
  overMessage,
  threshold = 0.9,
  className,
}: {
  /** Current field length (typically `value.length`). */
  value: number;
  max: number;
  /** The field's validation message, shown appended when over the limit. */
  overMessage: string;
  /** Fraction of `max` at which the counter becomes visible (0–1). */
  threshold?: number;
  className?: string;
}) {
  const remaining = max - value;
  const visible = value >= max * threshold;
  const over = remaining < 0;

  return (
    <p
      aria-live="polite"
      className={cn(
        "text-xs tabular-nums transition-opacity",
        over ? "text-destructive" : "text-muted-foreground",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {/* Empty (but present) while hidden so the region can announce on change. */}
      {visible
        ? over
          ? `Over by ${-remaining} — ${overMessage}`
          : `${remaining} left`
        : ""}
    </p>
  );
}
