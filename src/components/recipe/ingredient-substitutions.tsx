"use client";

import * as React from "react";
import { ArrowLeftRight } from "lucide-react";

import { cn } from "~/lib/utils";
import {
  getSubstitutions,
  isDietaryTag,
  matchIngredientDetailed,
  type DietaryTag,
} from "~/lib/substitutions";
import { safeSubstitutions } from "~/lib/dietary-match";
import { type Allergen } from "~/lib/allergens";
import { Badge, type BadgeProps } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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

const FILTER_TAGS = [
  "vegan",
  "vegetarian",
  "dairy-free",
  "gluten-free",
  "egg-free",
] as const satisfies readonly DietaryTag[];

const FILTER_LABEL: Record<(typeof FILTER_TAGS)[number], string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  "dairy-free": "Dairy-free",
  "gluten-free": "Gluten-free",
  "egg-free": "Egg-free",
};

/**
 * Subtle "swap" affordance shown only when an ingredient has known
 * substitutions. Opens a popover listing options with dietary tags. Renders
 * nothing when the ingredient has no match, so the list stays uncluttered.
 *
 * When the active family member can't have this ingredient (issue #429) the
 * trigger is `flagged` (warning-styled, with an explicit accessible label) and
 * the swap list is pre-filtered to `presetTags` so the safe option is the first
 * thing the cook sees.
 */
export function IngredientSubstitutions({
  item,
  className,
  flagged = false,
  presetTags,
  avoidAllergens,
}: {
  item: string;
  className?: string;
  flagged?: boolean;
  presetTags?: DietaryTag[];
  /**
   * The active member's FULL allergen set (issue #429 safety fix). When
   * provided, any swap whose own name/notes carry one of these allergens is
   * dropped — so a swap can never be presented as "safe" while introducing a
   * *different* one of the member's allergens (e.g. a cashew-based dairy swap
   * for a member who is also allergic to tree nuts).
   */
  avoidAllergens?: Allergen[];
}) {
  const presetKey = (presetTags ?? []).join("|");
  const [selectedTags, setSelectedTags] = React.useState<DietaryTag[]>(
    presetTags ?? [],
  );
  const match = React.useMemo(() => matchIngredientDetailed(item), [item]);
  const substitutions = React.useMemo(
    () =>
      safeSubstitutions(
        getSubstitutions(item, selectedTags),
        avoidAllergens ?? [],
      ),
    [item, selectedTags, avoidAllergens],
  );

  // Re-seed the filter when the active restriction changes (e.g. the cook picks
  // a different family member). Keyed on the joined tags so a same-content array
  // identity change doesn't clobber a manual toggle.
  React.useEffect(() => {
    setSelectedTags(
      presetKey.length > 0 ? presetKey.split("|").filter(isDietaryTag) : [],
    );
  }, [presetKey]);

  if (!match) return null;

  const { entry, confidence } = match;
  const confidenceLabel =
    confidence.charAt(0).toUpperCase() + confidence.slice(1);

  function toggleTag(tag: DietaryTag) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((selected) => selected !== tag)
        : [...current, tag],
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            flagged
              ? `Safe swaps for ${entry.name.toLowerCase()} — conflicts with the selected dietary needs`
              : `Substitutions for ${entry.name.toLowerCase()}`
          }
          title={flagged ? "See safe swaps" : "See substitutions"}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            flagged
              ? "text-warning hover:bg-warning/10"
              : "text-muted-foreground hover:bg-muted hover:text-primary",
            className,
          )}
        >
          <ArrowLeftRight className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="text-sm">
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center gap-1.5 font-display text-sm font-semibold">
            <ArrowLeftRight className="size-3.5 text-primary" />
            Out of {entry.name.toLowerCase()}?
          </div>
          <p className="text-xs text-muted-foreground">
            {confidenceLabel} confidence match
          </p>
        </div>
        <div
          role="group"
          aria-label="Filter substitutions by dietary need"
          className="mb-3 flex flex-wrap gap-1.5"
        >
          {FILTER_TAGS.map((tag) => {
            const selected = selectedTags.includes(tag);
            return (
              <Button
                key={tag}
                type="button"
                size="sm"
                variant={selected ? "secondary" : "outline"}
                aria-pressed={selected}
                onClick={() => toggleTag(tag)}
                className="h-7 rounded-full px-2 text-xs"
              >
                {FILTER_LABEL[tag]}
              </Button>
            );
          })}
        </div>
        {substitutions.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {substitutions.map((sub, i) => (
              <li
                key={`${sub.substitute}-${i}`}
                className="flex flex-col gap-1"
              >
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
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            No swaps match every selected dietary need.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
