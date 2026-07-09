"use client";

import * as React from "react";

import { loadMoreLibraryAction } from "~/server/recipes/library-actions";
import { Button } from "~/components/ui/button";
import {
  RecipeCard,
  type CardRecipe,
  type QuickPlanContext,
} from "~/components/recipe/recipe-card";
import { type CardDietaryMember } from "~/components/recipe/card-dietary-badge";

/**
 * The viewer's personal cookbook with a "Load more" button (#57).
 *
 * The library used to render every card at once; it now starts with one page
 * and appends further pages via the load-more server action, mirroring
 * {@link DiscoverFeed}. Newly fetched items are de-duped by id in case the feed
 * shifts between requests. Cards keep the "safe for" member badges and the
 * quick add-to-plan control the initial render provides.
 */
export function LibraryFeed({
  initialItems,
  initialNextOffset,
  canFavorite = false,
  favoritedIds = [],
  priorityCount = 0,
  members,
  quickPlan,
}: {
  initialItems: CardRecipe[];
  initialNextOffset: number | null;
  canFavorite?: boolean;
  favoritedIds?: string[];
  /**
   * Number of leading (initial) cards to render with LCP `priority`. Set > 0
   * only when this grid is above the fold; paged-in items always stay lazy.
   */
  priorityCount?: number;
  members?: CardDietaryMember[];
  quickPlan?: QuickPlanContext;
}) {
  const [items, setItems] = React.useState<CardRecipe[]>(initialItems);
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
      const result = await loadMoreLibraryAction(nextOffset);
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const fresh = result.items.filter((r) => !seen.has(r.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      setNextOffset(result.nextOffset);
    });
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((recipe, i) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            canFavorite={canFavorite}
            favorited={favoritedSet.has(recipe.id)}
            quickPlan={quickPlan}
            priority={i < priorityCount}
            members={members}
          />
        ))}
      </div>
      {nextOffset != null && (
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
    </>
  );
}
