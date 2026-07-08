import * as React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { ALLERGEN_LABELS, summarizeAllergens } from "~/lib/allergens";

/**
 * A compact, server-rendered "Contains" allergen summary for a recipe. Rolls
 * the ingredient list up with {@link summarizeAllergens} and renders the result
 * as high-contrast caution badges so a cook can see the allergen picture before
 * committing to a recipe — without scanning every line.
 *
 * Detection is best-effort (it can't see brand formulations or unusual
 * phrasings), so the copy always pairs the badges with a "double-check"
 * disclaimer and the empty state never claims a recipe is allergen-free.
 */
export function AllergenSummary({
  items,
  className,
  headingId,
}: {
  /** Free-text ingredient `item` strings for the recipe. */
  items: string[];
  className?: string;
  /** Optional id so an outer heading can label the region. */
  headingId?: string;
}) {
  const allergens = summarizeAllergens(items);

  if (allergens.length === 0) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p>
          No common allergens detected — always double-check the ingredients.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-label={headingId ? undefined : "Allergen summary"}
      className={cn(
        "rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span
          id={headingId}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-warning-foreground"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Contains
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {allergens.map((allergen) => (
            <li key={allergen}>
              <Badge variant="warning">{ALLERGEN_LABELS[allergen]}</Badge>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Best-effort detection — always double-check the ingredients for
        allergies.
      </p>
    </section>
  );
}
