"use client";

import Link from "next/link";
import { ChefHat, UtensilsCrossed } from "lucide-react";

import { useFeatureFlag } from "~/components/analytics/flags-provider";
import { useThemeBehavior } from "~/components/theme/theme-provider";
import { Button } from "~/components/ui/button";
import { pickKidCopy } from "~/config/kid-copy";

/** Feature-flag key for the empty-library CTA experiment (issue #336). */
export const EMPTY_LIBRARY_CTA_FLAG = "empty-library-cta";

type EmptyLibraryCopy = { heading: string; body: string; cta: string };

/**
 * Copy variants for the empty-library CTA A/B test. `control` reproduces the
 * previous static empty state verbatim; treatment variants are benefit-led. The
 * flag is multivariate (string), so more variants can be added here without
 * touching call sites.
 */
const VARIANTS: Record<string, EmptyLibraryCopy> = {
  control: {
    heading: "No recipes yet",
    body: "Add the dish everyone always asks you to make. It only takes a minute.",
    cta: "Create your first recipe",
  },
  benefit: {
    heading: "Save your family's first recipe",
    body: "Keep the dishes everyone loves in one place — start with the one they always ask you to make.",
    cta: "Save your first recipe",
  },
};

/** Resolve a flag value to a copy variant, defaulting to control. */
export function emptyLibraryCopy(variant: string | boolean): EmptyLibraryCopy {
  if (typeof variant === "string" && variant in VARIANTS) {
    return VARIANTS[variant]!;
  }
  return VARIANTS.control!;
}

/**
 * Empty-state CTA for a brand-new (empty) recipe library, A/B tested behind the
 * `empty-library-cta` flag (issue #336). The variant is SSR-evaluated — the root
 * layout seeds every flag into the flags context — so the correct copy renders
 * on the first paint with no flicker or layout shift. `useFeatureFlag` records
 * the `$feature_flag_called` exposure on mount; the experiment's primary metric
 * is `first_recipe_created`.
 */
export function EmptyLibraryCta() {
  const variant = useFeatureFlag(EMPTY_LIBRARY_CTA_FLAG, "control");
  const { kidSafe } = useThemeBehavior();
  const base = emptyLibraryCopy(variant);
  // Kids mode overrides the A/B copy with simpler words, regardless of variant.
  const copy = {
    heading: pickKidCopy(kidSafe, "empty.recipes.title", base.heading),
    body: pickKidCopy(kidSafe, "empty.recipes.body", base.body),
    cta: pickKidCopy(kidSafe, "cta.create", base.cta),
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
        <UtensilsCrossed className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold">{copy.heading}</h2>
        <p className="mt-1 max-w-sm text-muted-foreground">{copy.body}</p>
      </div>
      <Button asChild size="lg">
        <Link href="/recipes/new">
          <ChefHat /> {copy.cta}
        </Link>
      </Button>
    </div>
  );
}
