"use client";

import * as React from "react";

import { loadMoreSearchAction } from "~/server/recipes/search-actions";
import { type RecipeSearchResult } from "~/server/recipes/queries";
import { Button } from "~/components/ui/button";
import {
  RecipeCard,
  type QuickPlanContext,
} from "~/components/recipe/recipe-card";
import { type CardDietaryMember } from "~/components/recipe/card-dietary-badge";

/**
 * Search/filter results grid with a "Load more" button (#58).
 *
 * Results used to be silently capped at the first page and the header printed
 * that page's length as if it were the total. This owns incremental paging via
 * the load-more server action (re-parsing the active search from its query
 * string) and shows a `N+` hint whenever more results remain, so the count never
 * masquerades as a hard total. New items are de-duped by id.
 */
export function SearchResultsFeed({
  initialItems,
  initialNextOffset,
  queryString,
  canFavorite = false,
  favoritedIds = [],
  priorityCount = 0,
  members,
  quickPlan,
  correction,
}: {
  initialItems: RecipeSearchResult[];
  initialNextOffset: number | null;
  /** Canonical query string of the effective search, re-parsed server-side. */
  queryString: string;
  canFavorite?: boolean;
  favoritedIds?: string[];
  priorityCount?: number;
  members?: CardDietaryMember[];
  quickPlan?: QuickPlanContext;
  correction?: { from: string; to: string };
}) {
  const [items, setItems] = React.useState<RecipeSearchResult[]>(initialItems);
  const [nextOffset, setNextOffset] = React.useState<number | null>(
    initialNextOffset,
  );
  const [pending, startTransition] = React.useTransition();
  const favoritedSet = React.useMemo(
    () => new Set(favoritedIds),
    [favoritedIds],
  );

  function onLoadMore() {
    if (nextOffset == null || pending) return;
    startTransition(async () => {
      const result = await loadMoreSearchAction(queryString, nextOffset);
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const fresh = result.items.filter((r) => !seen.has(r.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      setNextOffset(result.nextOffset);
    });
  }

  const hasMore = nextOffset != null;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Results
          </h2>
          {correction && (
            <p className="text-sm text-muted-foreground">
              No exact matches for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{correction.from}&rdquo;
              </span>
              . Showing results for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{correction.to}&rdquo;
              </span>
              .
            </p>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {items.length}
          {hasMore ? "+" : ""} recipe{items.length === 1 && !hasMore ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((recipe, i) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            canFavorite={canFavorite}
            favorited={favoritedSet.has(recipe.id)}
            quickPlan={quickPlan}
            priority={i < priorityCount}
            matchReason={recipe.matchReason}
            members={members}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onLoadMore}
            disabled={pending}
          >
            {pending ? "Loading…" : "Load more recipes"}
          </Button>
        </div>
      )}
    </section>
  );
}
