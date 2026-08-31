import 'server-only';

import { revalidatePath, updateTag } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';

import { recipeRevalidationPaths, type RecipeCreatorRef } from '~/lib/recipe-path';
import { db, isDbConfigured } from '~/server/db';
import { recipeCreators, recipes } from '~/server/db/schema';
import { recipeMutationTags } from './cache-tags';

/**
 * Invalidate the Next data-cache tags for a recipe write: the recipe entity
 * plus the public list feed that may include it (#160).
 *
 * Lives here rather than in `actions.ts` because that module is `"use server"`,
 * where every export must be an async action — so a helper defined there can't
 * be shared with the other action modules that need the same invalidation.
 */
export function revalidateRecipeTags(id: string): void {
  for (const tag of recipeMutationTags(id)) updateTag(tag);
}

/**
 * The extra namespaces a recipe answers in because of its accepted co-creators
 * (#668). Pending invitations are excluded by the same `accepted` filter every
 * other access path uses, and a creator whose user slug is somehow missing is
 * skipped rather than emitting a broken path.
 */
async function creatorNamespaces(recipeId: string): Promise<RecipeCreatorRef[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.recipeCreators.findMany({
    where: and(eq(recipeCreators.recipeId, recipeId), eq(recipeCreators.status, 'accepted')),
    columns: { slug: true },
    with: { user: { columns: { slug: true } } },
  });
  return rows.flatMap((row) =>
    row.slug && row.user?.slug ? [{ cook: row.user.slug, slug: row.slug }] : [],
  );
}

/**
 * Bust every cached path a recipe answers on (#666, #668).
 *
 * A recipe is served at its canonical `/recipes/<cook>/<slug>` URL, at the flat
 * legacy `/recipes/<slug>` one, and at one path per accepted co-creator. The
 * App Router caches those independently, so revalidating only one leaves
 * everyone arriving on another looking at stale content.
 *
 * Current creator paths are discovered here rather than passed in, so no caller
 * can forget half the fan-out. `extraCreators` covers the one case discovery
 * cannot reach: a namespace that has *just stopped* resolving, whose row is
 * already deleted by the time we get here. Purging it is the cache half of
 * revocation — skip it and a removed creator's page keeps being served after
 * their access was withdrawn.
 */
export async function revalidateRecipePaths(
  recipe: {
    id: string;
    slug: string | null;
    cook?: string | null;
  },
  extraCreators: RecipeCreatorRef[] = [],
): Promise<void> {
  const namespaces = [...(await creatorNamespaces(recipe.id)), ...extraCreators];
  for (const path of recipeRevalidationPaths(recipe, namespaces)) revalidatePath(path);
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
 *
 * A slug can also be held by a *co-creator* entry rather than a recipe row
 * (#668), so both sources are searched and de-duped by recipe id.
 */
export async function revalidateRecipeSlugPaths(recipeSlug: string): Promise<void> {
  revalidatePath(`/recipes/${recipeSlug}`);
  if (!isDbConfigured()) return;
  const owned = await db.query.recipes.findMany({
    where: and(eq(recipes.slug, recipeSlug), isNull(recipes.deletedAt)),
    columns: { id: true, slug: true },
    with: { author: { columns: { slug: true } } },
  });
  const coCreated = await db.query.recipeCreators.findMany({
    where: and(eq(recipeCreators.slug, recipeSlug), eq(recipeCreators.status, 'accepted')),
    columns: { id: true },
    with: {
      recipe: {
        columns: { id: true, slug: true, deletedAt: true },
        with: { author: { columns: { slug: true } } },
      },
    },
  });

  const targets = new Map<string, { slug: string | null; cook?: string }>();
  for (const row of owned) targets.set(row.id, { slug: row.slug, cook: row.author?.slug });
  for (const row of coCreated) {
    const recipe = row.recipe;
    if (!recipe || recipe.deletedAt) continue;
    targets.set(recipe.id, {
      slug: recipe.slug,
      cook: recipe.author?.slug,
    });
  }

  for (const [id, target] of targets) {
    await revalidateRecipePaths({ id, slug: target.slug, cook: target.cook });
  }
}
