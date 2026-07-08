"use client";

import * as React from "react";

import { loadMorePublicRecipesAction } from "~/server/recipes/discover-actions";
import { type RatingSort } from "~/lib/ratings";
import { Button } from "~/components/ui/button";
import { RecipeCard, type CardRecipe } from "~/components/recipe/recipe-card";

/**
 * Client-side discover list with a "Load more" button.
 *
 * Kept intentionally small and self-contained so other views can wrap it (e.g.
 * search / filter / sort) while it owns the grid and incremental paging via the
 * load-more server action. Newly fetched items are de-duped by id as a guard
 * against overlap if the feed shifts between requests.
 */
export function DiscoverFeed({
  initialItems,
  initialNextOffset,
  sort = "recent",
  canFavorite = false,
  favoritedIds = [],
  priorityCount = 0,
}: {
  initialItems: CardRecipe[];
  initialNextOffset: number | null;
  sort?: RatingSort;
  canFavorite?: boolean;
  favoritedIds?: string[];
  /**
   * Number of leading (initial) cards to render with LCP `priority`. Set > 0
   * only when this feed is the above-the-fold grid; later paged-in items always
   * stay lazy since they are appended after these indices.
   */
  priorityCount?: number;
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
      const result = await loadMorePublicRecipesAction(nextOffset, sort);
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
            priority={i < priorityCount}
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
