import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * A single plan-limit usage meter for the billing surface (issue #319).
 *
 * Presentational and server-renderable: it turns a `used` / `limit` pair from the
 * entitlements resolver into a labelled bar plus honest "X of Y used" copy.
 * Unlimited plans (`limit === null`) render a calm, full bar with an
 * "Unlimited" note rather than an empty gauge, and the fill switches to the
 * warning token once usage is at/over the warn threshold — the same restrained,
 * non-alarming language used elsewhere. Reads correctly across all UI modes.
 */
export function UsageMeter({
  label,
  used,
  limit,
  ratio,
  state,
  format = (n) => n.toLocaleString(),
}: {
  label: string;
  used: number;
  limit: number | null;
  ratio: number;
  state: "ok" | "warn" | "blocked";
  format?: (n: number) => string;
}) {
  const unlimited = limit === null;
  const pct = unlimited ? 100 : Math.min(100, Math.max(0, ratio * 100));
  const alert = state !== "ok";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {unlimited
            ? `${format(used)} used · Unlimited`
            : `${format(used)} of ${format(limit)} used`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={unlimited ? undefined : limit}
        aria-valuenow={used}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            unlimited
              ? "bg-primary/40"
              : alert
                ? "bg-warning"
                : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
