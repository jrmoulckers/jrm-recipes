"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * Cook Mode "offline-ready" affordance (#141). A recipe open in Cook Mode is
 * already loaded for the session, so it can be finished hands-free even if Wi‑Fi
 * drops. This subtle badge (near the "Screen awake" indicator) reassures the cook
 * of that, with an explanatory tooltip. It is copy-only and reflects the promise the
 * PWA already keeps, not a live cache probe.
 */
export function OfflineReadyBadge({ className }: { className?: string }) {
  const t = useTranslations("pwa.connectivity");
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1", className)}>
            <WifiOff className="size-3.5" />
            {t("cachedBadge")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent multiline className="text-center">
          {t("cachedTooltip")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
