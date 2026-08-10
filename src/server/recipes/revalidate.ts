import "server-only";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { recipeRevalidationPaths } from "~/lib/recipe-path";
import { db, isDbConfigured } from "~/server/db";
import { recipes } from "~/server/db/schema";

/**
 * Bust every cached path a recipe answers on (#666).
 *
 * A recipe is served both at its canonical `/recipes/<cook>/<slug>` URL and at
 * the flat legacy `/recipes/<slug>` one, and the App Router caches those
 * independently — so revalidating only one leaves everyone arriving on the
 * other looking at stale content.
 */
export function revalidateRecipePaths(recipe: {
  id: string;
  slug: string | null;
  cook?: string | null;
}): void {
  for (const path of recipeRevalidationPaths(recipe)) revalidatePath(path);
}

/**
 * Same fan-out, for the many engagement/collection/cook-log actions whose
 * client only holds the recipe *slug*.
 *
 * Slugs are no longer globally unique — they are unique per cook — so a slug
 * can name one recipe per namespace. Rather than guess an owner we bust the
 * legacy flat path plus the canonical path of **every** recipe holding that
 * slug. Over-revalidating is harmless (it only drops cache entries, and
 * `revalidatePath` leaks nothing to the caller), whereas missing the right
 * owner would leave the canonical page stale — the actual bug.
 */
export async function revalidateRecipeSlugPaths(
  recipeSlug: string,
): Promise<void> {
  revalidatePath(`/recipes/${recipeSlug}`);
  if (!isDbConfigured()) return;
  const rows = await db.query.recipes.findMany({
    where: and(eq(recipes.slug, recipeSlug), isNull(recipes.deletedAt)),
    columns: { id: true, slug: true },
    with: { author: { columns: { slug: true } } },
  });
  for (const row of rows) {
    revalidateRecipePaths({
      id: row.id,
      slug: row.slug,
      cook: row.author?.slug,
    });
  }
}
