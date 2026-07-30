"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  JOURNAL_RANGES,
  JOURNAL_RANGE_LABELS,
  type JournalRange,
} from "~/lib/journal-range";
import type { CookedRecipeOption } from "~/server/cooklog/queries";
import { NativeSelect } from "~/components/ui/native-select";

/**
 * Journal filter controls (#364): a recipe picker and a time-range picker whose
 * state lives entirely in the URL query string, so the server page re-renders
 * the filtered list + insights and the view is shareable / back-button friendly.
 */
export function JournalFilters({
  recipes,
  selectedRecipeId,
  selectedRange,
}: {
  recipes: CookedRecipeOption[];
  selectedRecipeId: string | null;
  selectedRange: JournalRange;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/journal?${qs}` : "/journal");
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        Recipe
        <NativeSelect
          wrapperClassName="w-auto"
          value={selectedRecipeId ?? ""}
          onChange={(event) => setParam("recipe", event.target.value || null)}
          aria-label="Filter journal by recipe"
        >
          <option value="">All recipes</option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.title}
            </option>
          ))}
        </NativeSelect>
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        When
        <NativeSelect
          wrapperClassName="w-auto"
          value={selectedRange}
          onChange={(event) =>
            setParam(
              "range",
              event.target.value === "all" ? null : event.target.value,
            )
          }
          aria-label="Filter journal by time range"
        >
          {JOURNAL_RANGES.map((range: JournalRange) => (
            <option key={range} value={range}>
              {JOURNAL_RANGE_LABELS[range]}
            </option>
          ))}
        </NativeSelect>
      </label>
    </div>
  );
}
