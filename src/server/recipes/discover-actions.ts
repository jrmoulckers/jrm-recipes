"use server";

import { getCurrentUser } from "~/server/auth";
import { parseRatingSort, type RatingSort } from "~/lib/ratings";
import { type Paginated } from "./pagination";
import {
  listLibrary,
  listPublicRecipes,
  type PublicRecipeListItem,
} from "./queries";

/**
 * Fetch a further page of the public discover feed for the "Load more" button.
 *
 * Re-derives the viewer server-side (never trusts the client) and hides recipes
 * already in their library, mirroring the initial render on `/recipes`. The
 * offset is clamped so a malformed value can't skip or repeat the whole feed.
 */
export async function loadMorePublicRecipesAction(
  offset: number,
  sort: RatingSort = "recent",
): Promise<Paginated<PublicRecipeListItem>> {
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const safeSort = parseRatingSort(sort);
  const user = await getCurrentUser();
  const [page, mine] = await Promise.all([
    listPublicRecipes({ offset: start, sort: safeSort }),
    listLibrary(user),
  ]);
  const mineIds = new Set(mine.map((r) => r.id));
  return {
    items: page.items.filter((r) => !mineIds.has(r.id)),
    nextOffset: page.nextOffset,
  };
}
