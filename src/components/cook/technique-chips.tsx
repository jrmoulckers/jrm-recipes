"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";

import { Badge, badgeVariants } from "~/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { lookupTechnique } from "~/lib/techniques";
import { cn } from "~/lib/utils";

type TechniqueChipsProps = {
  techniques?: string[] | null;
  /** Extra classes applied to each chip (e.g. `text-sm` in the step header). */
  className?: string;
};

/**
 * Renders a step's technique tags as chips. Known techniques become tappable
 * and open a popover with a tip from the bundled knowledge base; unknown or
 * empty labels fall back to a plain, non-interactive badge. All data is static
 * so cook mode stays fully offline-capable.
 */
export function TechniqueChips({ techniques, className }: TechniqueChipsProps) {
  const labels = (techniques ?? [])
    .map((label) => label?.trim())
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) return null;

  return (
    <>
      {labels.map((label, index) => (
        <TechniqueChip key={`${label}-${index}`} rawLabel={label} className={className} />
      ))}
    </>
  );
}

function TechniqueChip({
  rawLabel,
  className,
}: {
  rawLabel: string;
  className?: string;
}) {
  const match = lookupTechnique(rawLabel);

  if (!match.known) {
    return (
      <Badge variant="outline" className={className}>
        {match.label}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Learn the ${match.label} technique`}
          className={cn(
            badgeVariants({ variant: "outline" }),
            "cursor-pointer gap-1 border-dashed underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <BookOpen className="size-3.5" aria-hidden="true" />
          {match.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {match.label}
          </span>
          <Badge variant="muted" className="text-[10px] uppercase tracking-wide">
            Technique
          </Badge>
        </div>
        {match.shortTip && (
          <p className="text-sm font-medium text-foreground">{match.shortTip}</p>
        )}
        {match.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {match.description}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
