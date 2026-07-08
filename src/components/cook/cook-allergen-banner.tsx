"use client";

import * as React from "react";
import { AlertTriangle, X } from "lucide-react";

import { ALLERGEN_LABELS, summarizeAllergens } from "~/lib/allergens";
import { Button } from "~/components/ui/button";
import { type CookRecipe } from "./types";

/**
 * A last, glanceable allergen safety check shown as Cook Mode starts (issue
 * #395). Reuses {@link summarizeAllergens} — no duplicate detection — and sits
 * persistently below the header until the cook acknowledges it. Renders nothing
 * when no allergens are detected, so it never blocks an allergen-free cook.
 */
export function CookAllergenBanner({ recipe }: { recipe: CookRecipe }) {
  const allergens = React.useMemo(
    () => summarizeAllergens(recipe.ingredients.map((ing) => ing.item)),
    [recipe.ingredients],
  );
  const [acknowledged, setAcknowledged] = React.useState(false);

  if (allergens.length === 0 || acknowledged) return null;

  const labels = allergens.map((a) => ALLERGEN_LABELS[a]);

  return (
    <div
      role="region"
      aria-label="Allergen safety check"
      className="border-b border-warning/50 bg-warning/15 text-warning-foreground motion-safe:animate-fade-in"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-3 py-3 sm:px-5 sm:py-4">
        <AlertTriangle className="size-7 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-lg font-semibold leading-tight sm:text-xl">
          <span className="font-bold">This recipe contains:</span>{" "}
          {labels.join(", ")}
        </p>
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
