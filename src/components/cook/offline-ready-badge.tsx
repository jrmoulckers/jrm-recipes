"use client";

import { WifiOff } from "lucide-react";

import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { CONNECTIVITY_COPY } from "~/lib/connectivity-copy";

/**
 * Cook Mode "offline-ready" affordance (#141). A recipe open in Cook Mode is
 * already loaded for the session, so it can be finished hands-free even if Wi‑Fi
 * drops. This subtle badge (near the "Screen awake" indicator) reassures the cook
 * of that, with an explanatory tooltip. Copy-only — it reflects the promise the
 * PWA already keeps, not a live cache probe.
 */
export function OfflineReadyBadge({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1", className)}>
            <WifiOff className="size-3.5" />
            {CONNECTIVITY_COPY.cachedBadge}
          </Badge>
        </TooltipTrigger>
        <TooltipContent multiline className="text-center">
          {CONNECTIVITY_COPY.cachedTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
