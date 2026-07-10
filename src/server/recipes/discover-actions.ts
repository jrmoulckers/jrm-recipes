"use server";

import { getCurrentUser } from "~/server/auth";
import { parseRatingSort, type RatingSort } from "~/lib/ratings";
import { type Paginated } from "./pagination";
import {
  listLibraryRecipeIds,
  listPublicRecipes,
  type PublicRecipeListItem,
} from "./queries";

/**
 * Safety cap on how many raw discover pages a single "Load more" will pull while
 * skipping past pages the viewer has entirely filtered out (#67). Bounds the
 * work for a viewer who owns a long prefix of the feed without letting the
 * button chase the feed forever.
 */
const MAX_LOAD_MORE_PAGES = 20;

/**
 * Fetch a further page of the public discover feed for the "Load more" button.
 *
 * Re-derives the viewer server-side (never trusts the client) and hides recipes
 * already in their library, mirroring the initial render on `/recipes`. The
 * offset is clamped so a malformed value can't skip or repeat the whole feed.
 *
 * A prolific viewer can own an entire raw page, so filtering their own recipes
 * out *after* paging could leave an empty page while more feed remained — and
 * because the old code returned the unfiltered page's `nextOffset`, the button
 * stayed even though it had just added zero cards (#67). We now keep pulling
 * pages until we have at least one card to show (or the feed is exhausted) and
 * return the offset past the last page we actually consumed, so an empty result
 * reliably hides the button.
 */
export async function loadMorePublicRecipesAction(
  offset: number,
  sort: RatingSort = "recent",
): Promise<Paginated<PublicRecipeListItem>> {
  const safeSort = parseRatingSort(sort);
  const user = await getCurrentUser();
  const mineIds = new Set(await listLibraryRecipeIds(user));

  let start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const items: PublicRecipeListItem[] = [];
  let nextOffset: number | null = start;

  for (let page = 0; page < MAX_LOAD_MORE_PAGES; page++) {
    const result = await listPublicRecipes({ offset: start, sort: safeSort });
    for (const recipe of result.items) {
      if (!mineIds.has(recipe.id)) items.push(recipe);
    }
    nextOffset = result.nextOffset;
    // Stop once this batch yielded something to show, or the feed is exhausted.
    if (items.length > 0 || result.nextOffset == null) break;
    start = result.nextOffset;
  }

  return { items, nextOffset };
}
