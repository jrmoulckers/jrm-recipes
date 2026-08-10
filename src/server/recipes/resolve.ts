import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "~/server/db";
import { recipeCreators, recipeSlugAliases, recipes } from "~/server/db/schema";
import { resolveUserSlug } from "~/server/users/slug";

/**
 * URL → recipe resolution for the namespaced recipe routes (#666, #668).
 *
 * Canonical recipe URLs are `/recipes/<cook>/<recipe>`, where `<cook>` is the
 * author's {@link users.slug} and `<recipe>` is unique only inside that
 * namespace. Four other shapes must keep resolving:
 *
 * 1. a retired recipe slug (the recipe was renamed) — `recipe_slug_aliases`;
 * 2. a retired user slug (the cook renamed) — `user_slug_aliases`;
 * 3. the pre-namespacing flat `/recipes/<slug>` (or `/recipes/<id>`) URL;
 * 4. a **co-creator's** namespace (#668) — `recipe_creators`.
 *
 * Every one of those resolves to a recipe **id** plus a
 * {@link RecipeUrlDisposition}. The route turns `alias` into a 308 — but only
 * *after* the viewer has passed the normal `canView` check, so a redirect can
 * never confirm that a recipe exists to somebody who is not allowed to see it.
 */

/**
 * What kind of URL the request arrived on, and therefore what the route owes it.
 *
 * - `canonical` — the one indexable URL. Render.
 * - `mirror` — a co-creator's namespace (#668). Render **200** with
 *   `rel=canonical` pointing at the owner's path. Deliberately not a redirect:
 *   a creator sharing "their" link should keep seeing their own namespace in the
 *   address bar, while search engines still consolidate on one URL.
 * - `alias` — a retained or legacy URL. 308 to the canonical path.
 *
 * This is a union rather than a `canonical: boolean` precisely because `mirror`
 * is neither: a boolean would silently fold it into one of the other two, and
 * whichever way it fell would be wrong.
 */
export type RecipeUrlDisposition = "canonical" | "mirror" | "alias";

export type RecipeUrlResolution = {
  /** The recipe the URL points at. */
  recipeId: string;
  /** How the route should respond to this URL shape. */
  disposition: RecipeUrlDisposition;
};

/** Reject segments that can't be a slug or id before touching the database. */
function normalizeSegment(segment: string): string | null {
  const trimmed = segment.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return trimmed;
}

/**
 * Resolve the canonical two-segment URL `/recipes/<cook>/<recipe>`.
 *
 * Live slugs win over aliases, so a slug that was retired by one recipe and
 * later re-issued to another always resolves to the *current* holder rather
 * than silently redirecting to somebody else's content. (Allocation also treats
 * aliases as occupied, so within one namespace this can only happen when the
 * same owner reuses their own retired slug.)
 *
 * The co-creator probe sits between the two. Ordering it against the live probe
 * is defensive rather than load-bearing: allocation treats all three occupant
 * kinds as one namespace under an advisory lock, so a slug cannot be live *and*
 * a creator entry for the same user. Preferring the live recipe means that if
 * that invariant were ever violated, the URL keeps pointing at the recipe the
 * namespace holder actually owns.
 *
 * A creator entry reached through a *retired* user slug degrades to `alias`, not
 * `mirror`: the address is already non-canonical, so there is nothing to
 * preserve by rendering it in place, and 308ing to the owner's canonical path is
 * both simpler and stricter than inventing a redirect to the creator's current
 * namespace.
 */
export const resolveNamespacedRecipe = cache(
  async (
    cookSegment: string,
    recipeSegment: string,
  ): Promise<RecipeUrlResolution | null> => {
    const cook = normalizeSegment(cookSegment);
    const recipe = normalizeSegment(recipeSegment);
    if (!cook || !recipe) return null;

    const owner = await resolveUserSlug(cook);
    if (!owner) return null;

    const live = await db.query.recipes.findFirst({
      where: and(eq(recipes.authorId, owner.userId), eq(recipes.slug, recipe)),
      columns: { id: true },
    });
    if (live) {
      return {
        recipeId: live.id,
        disposition: owner.redirect ? "alias" : "canonical",
      };
    }

    // A recipe someone else owns, answering inside this namespace because its
    // holder is an accepted co-creator (#668). `status` is filtered here as well
    // as by the partial index: a pending invitation must not make a URL resolve.
    const creator = await db.query.recipeCreators.findFirst({
      where: and(
        eq(recipeCreators.userId, owner.userId),
        eq(recipeCreators.slug, recipe),
        eq(recipeCreators.status, "accepted"),
      ),
      columns: { recipeId: true },
    });
    if (creator) {
      return {
        recipeId: creator.recipeId,
        disposition: owner.redirect ? "alias" : "mirror",
      };
    }

    const alias = await db.query.recipeSlugAliases.findFirst({
      where: and(
        eq(recipeSlugAliases.ownerId, owner.userId),
        eq(recipeSlugAliases.slug, recipe),
      ),
      columns: { recipeId: true },
    });
    if (alias) return { recipeId: alias.recipeId, disposition: "alias" };

    // An id in the recipe position still resolves (the editor's post-save push
    // and hand-typed links both produce it), but it is never canonical.
    const byId = await db.query.recipes.findFirst({
      where: and(eq(recipes.authorId, owner.userId), eq(recipes.id, recipe)),
      columns: { id: true },
    });
    return byId ? { recipeId: byId.id, disposition: "alias" } : null;
  },
);

/**
 * Resolve the legacy flat URL `/recipes/<idOrSlug>`.
 *
 * These are the links that exist in the wild — shared in messages, indexed by
 * search engines, printed on cards — so they resolve forever and 308 to the
 * namespaced URL. Ordering is deterministic (exact id first, then the oldest
 * holder) so a flat slug never changes what it points at now that slugs are
 * only unique per author.
 *
 * The `legacy` alias rows seeded by the namespacing migration are the primary
 * lookup: they were copied from the old globally-unique slug column and carry a
 * partial unique index, so this stays unambiguous no matter how many cooks
 * later claim the same slug in their own namespaces.
 */
export const resolveFlatRecipe = cache(
  async (segment: string): Promise<RecipeUrlResolution | null> => {
    const value = normalizeSegment(segment);
    if (!value) return null;

    const byId = await db.query.recipes.findFirst({
      where: eq(recipes.id, value),
      columns: { id: true },
    });
    if (byId) return { recipeId: byId.id, disposition: "alias" };

    const legacy = await db.query.recipeSlugAliases.findFirst({
      where: and(
        eq(recipeSlugAliases.slug, value),
        eq(recipeSlugAliases.legacy, true),
      ),
      columns: { recipeId: true },
    });
    if (legacy) return { recipeId: legacy.recipeId, disposition: "alias" };

    const live = await db.query.recipes.findFirst({
      where: eq(recipes.slug, value),
      columns: { id: true },
      orderBy: [asc(recipes.createdAt), sql`${recipes.id} asc`],
    });
    return live ? { recipeId: live.id, disposition: "alias" } : null;
  },
);
