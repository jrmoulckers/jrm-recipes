"use server";

import { getCurrentUser } from "~/server/auth";
import { isAllergen } from "~/lib/allergens";
import { listMemberProfiles } from "~/server/dietary/queries";
import { type CardRecipe } from "~/components/recipe/recipe-card";
import { type Paginated } from "./pagination";
import { attachCardAllergens, listLibrary } from "./queries";

/**
 * Fetch a further page of the viewer's personal library for the cookbook's
 * "Load more" button (#57).
 *
 * Re-derives the viewer server-side (never trusts the client) and clamps the
 * offset so a malformed value can't skip or repeat the library. The allergen
 * roll-up that powers the "safe for" badges is only computed when a family
 * member with allergies is active, mirroring the initial `/recipes` render.
 */
export async function loadMoreLibraryAction(
  offset: number,
): Promise<Paginated<CardRecipe>> {
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const user = await getCurrentUser();
  const page = await listLibrary(user, { offset: start });

  const members = user ? await listMemberProfiles(user.id) : [];
  const showBadges = members.some((m) =>
    (m.allergens ?? []).some(isAllergen),
  );
  const items: CardRecipe[] = showBadges
    ? await attachCardAllergens(page.items)
    : page.items;

  return { items, nextOffset: page.nextOffset };
}
