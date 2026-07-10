"use server";

import { getCurrentUser } from "~/server/auth";
import { isAllergen } from "~/lib/allergens";
import { listMemberProfiles } from "~/server/dietary/queries";
import { type SearchParams } from "~/lib/route-params";
import { type Paginated } from "./pagination";
import { parseRecipeSearch } from "./search";
import {
  attachCardAllergens,
  searchRecipes,
  type RecipeSearchResult,
} from "./queries";

/**
 * Rebuild a `SearchParams` shape from a query string, preserving repeated keys
 * (`?tag=a&tag=b`) so multi-select facets survive the round-trip. Parsing the
 * querystring server-side means the "Load more" action re-validates and clamps
 * the search itself rather than trusting a client-supplied object.
 */
function paramsFromQueryString(queryString: string): SearchParams {
  const usp = new URLSearchParams(queryString);
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(usp.keys())) {
    const all = usp.getAll(key);
    out[key] = all.length > 1 ? all : all[0]!;
  }
  return out;
}

/**
 * Fetch a further page of search results for the results "Load more" button
 * (#58). The active search is passed as its canonical query string and re-parsed
 * server-side; the viewer is re-derived (never trusted) so visibility scoping
 * and "safe for" filtering match the initial render. Allergen badges are only
 * rolled up when a family member with allergies is active.
 */
export async function loadMoreSearchAction(
  queryString: string,
  offset: number,
): Promise<Paginated<RecipeSearchResult>> {
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const user = await getCurrentUser();
  const search = parseRecipeSearch(paramsFromQueryString(queryString));
  const page = await searchRecipes(user, search, { offset: start });

  const members = user ? await listMemberProfiles(user.id) : [];
  const showBadges = members.some((m) => (m.allergens ?? []).some(isAllergen));
  const items: RecipeSearchResult[] = showBadges
    ? await attachCardAllergens(page.items)
    : page.items;

  return { items, nextOffset: page.nextOffset };
}
