"use client";

import * as React from "react";

import { useThemeBehavior } from "~/components/theme/theme-provider";
import {
  type KidHazard,
  KID_HAZARD_INFO,
  detectStepHazards,
} from "~/lib/kid-safety";
import { cn } from "~/lib/utils";

/** High-contrast, theme-token styles per hazard (heat = danger, sharp = caution). */
const HAZARD_STYLES: Record<KidHazard, string> = {
  heat: "border-destructive/45 bg-destructive/10 text-destructive",
  sharp: "border-warning/55 bg-warning/15 text-warning-foreground",
};

/**
 * "Ask a grown-up" safety callout shown on the cook-mode step card (#423).
 *
 * Detects heat/sharp hazards from the step's instruction + technique tags and
 * renders a friendly, high-contrast banner — but only in Kids mode (gated on
 * `behavior.kidSafe`). Heat and sharp are visually and verbally distinct (emoji
 * + wording + color token), each carries an accessible label, and plain steps
 * render nothing so there are no false alarms.
 */
export function KidSafetyCallout({
  text,
  techniques,
  className,
}: {
  text?: string | null;
  techniques?: readonly string[] | null;
  className?: string;
}) {
  const { kidSafe } = useThemeBehavior();
  const hazards = React.useMemo(
    () => detectStepHazards({ text, techniques }),
    [text, techniques],
  );

  if (!kidSafe || hazards.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hazards.map((hazard) => {
        const info = KID_HAZARD_INFO[hazard];
        return (
          <div
            key={hazard}
            role="note"
            aria-label={info.label}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-lg font-semibold leading-snug",
              HAZARD_STYLES[hazard],
            )}
          >
            <span aria-hidden="true" className="text-3xl leading-none">
              {info.emoji}
            </span>
            <span>{info.message}</span>
          </div>
        );
      })}
    </div>
  );
}
