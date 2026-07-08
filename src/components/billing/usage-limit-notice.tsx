import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

/**
 * A calm, non-punitive usage notice for soft limits (issue #318).
 *
 * Surfaces the warning threshold *before* the hard cap and, once at the cap,
 * explains that existing content is untouched and offers one route to `/pricing`.
 * No countdowns, no scarcity — just an honest heads-up. Purely presentational so
 * it renders on the server and reads across all five UI modes + dark.
 */
export function UsageLimitNotice({
  used,
  limit,
  state,
  resource = "recipes",
  className,
}: {
  used: number;
  limit: number;
  state: "warn" | "blocked";
  resource?: string;
  className?: string;
}) {
  const blocked = state === "blocked";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        blocked
          ? "border-warning/40 bg-warning/10 text-warning-foreground"
          : "border-border bg-surface/60 text-muted-foreground",
        className,
      )}
    >
      <span className="flex items-start gap-2 sm:items-center">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 sm:mt-0"
          aria-hidden="true"
        />
        <span>
          {blocked
            ? `You've reached the free plan's limit of ${limit} ${resource}. You can still edit everything you've saved — upgrade to Family to add more.`
            : `You've used ${used} of ${limit} ${resource} on the free plan.`}
        </span>
      </span>
      <Button
        asChild
        size="sm"
        variant={blocked ? "default" : "outline"}
        className="shrink-0"
      >
        <Link href="/pricing">See plans</Link>
      </Button>
    </div>
  );
}
