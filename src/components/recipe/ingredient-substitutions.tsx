"use client";

import * as React from "react";
import { ArrowLeftRight } from "lucide-react";

import { cn } from "~/lib/utils";
import { matchIngredient, type DietaryTag } from "~/lib/substitutions";
import { Badge, type BadgeProps } from "~/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

const TAG_VARIANT: Record<DietaryTag, NonNullable<BadgeProps["variant"]>> = {
  vegan: "success",
  vegetarian: "secondary",
  "dairy-free": "accent",
  "gluten-free": "warning",
  "egg-free": "muted",
};

/**
 * Subtle "swap" affordance shown only when an ingredient has known
 * substitutions. Opens a popover listing options with dietary tags. Renders
 * nothing when the ingredient has no match, so the list stays uncluttered.
 */
export function IngredientSubstitutions({
  item,
  className,
}: {
  item: string;
  className?: string;
}) {
  const entry = React.useMemo(() => matchIngredient(item), [item]);
  if (!entry) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Substitutions for ${entry.name.toLowerCase()}`}
          title="See substitutions"
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            className,
          )}
        >
          <ArrowLeftRight className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="text-sm">
        <div className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold">
          <ArrowLeftRight className="size-3.5 text-primary" />
          Out of {entry.name.toLowerCase()}?
        </div>
        <ul className="flex flex-col gap-2.5">
          {entry.substitutions.map((sub, i) => (
            <li key={`${sub.substitute}-${i}`} className="flex flex-col gap-1">
              <span className="font-medium">{sub.substitute}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {sub.ratioOrNotes}
              </span>
              {sub.dietaryTags && sub.dietaryTags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {sub.dietaryTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={TAG_VARIANT[tag]}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
