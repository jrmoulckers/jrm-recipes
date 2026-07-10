"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, X } from "lucide-react";

import {
  ALLERGEN_LABELS,
  summarizeAllergens,
  summarizeHiddenAllergens,
} from "~/lib/allergens";
import { formatList } from "~/lib/i18n-format";
import { Button } from "~/components/ui/button";
import { type CookRecipe } from "./types";

const DISCLAIMER =
  "Best-effort from ingredient text — always double-check labels and brands.";

/**
 * A last, glanceable allergen safety check shown as Cook Mode starts (issue
 * #395). Reuses {@link summarizeAllergens} and {@link summarizeHiddenAllergens}
 * — no duplicate detection — and sits persistently below the header until the
 * cook acknowledges it. Surfaces both directly-carried allergens and hidden or
 * derived ones (e.g. wheat brewed into soy sauce) so it never gives a false
 * all-clear, and carries the same best-effort disclaimer as every other
 * allergen surface. Renders nothing when nothing is detected, so it never
 * blocks an allergen-free cook.
 */
export function CookAllergenBanner({ recipe }: { recipe: CookRecipe }) {
  const items = React.useMemo(
    () => recipe.ingredients.map((ing) => ing.item),
    [recipe.ingredients],
  );
  const allergens = React.useMemo(() => summarizeAllergens(items), [items]);
  const hidden = React.useMemo(() => summarizeHiddenAllergens(items), [items]);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const locale = useLocale();

  if ((allergens.length === 0 && hidden.length === 0) || acknowledged) {
    return null;
  }

  const labels = allergens.map((a) => ALLERGEN_LABELS[a]);
  const hiddenLabels = hidden.map((w) => ALLERGEN_LABELS[w.allergen]);

  return (
    <div
      role="region"
      aria-label="Allergen safety check"
      className="border-b border-warning/50 bg-warning/15 text-warning-foreground motion-safe:animate-fade-in"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-3 py-3 sm:px-5 sm:py-4">
        <AlertTriangle className="size-7 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          {labels.length > 0 && (
            <p className="text-lg font-semibold leading-tight sm:text-xl">
              <span className="font-bold">This recipe contains:</span>{" "}
              {formatList(labels, locale)}
            </p>
          )}
          {hiddenLabels.length > 0 && (
            <p className="text-sm font-medium leading-tight sm:text-base">
              <span className="font-semibold">
                May also contain (check labels):
              </span>{" "}
              {formatList(hiddenLabels, locale)}
            </p>
          )}
          <p className="text-xs font-normal opacity-80">{DISCLAIMER}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="shrink-0 border-warning/60"
          onClick={() => setAcknowledged(true)}
        >
          <X className="size-5" />
          Got it
        </Button>
      </div>
    </div>
  );
}
