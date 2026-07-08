import "server-only";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { recipes, users } from "~/server/db/schema";

/**
 * Public creator profile (issue #327): a cook identified by their unique
 * `handle`, plus every `public` + `published` recipe they authored (newest
 * first) for the profile grid. Never returns private/group/unlisted/draft
 * recipes. Returns `null` for an empty/unknown handle or when the DB is
 * unconfigured, so the route can `notFound()` cleanly.
 */
export async function getPublicProfileByHandle(handle: string) {
  if (!isDbConfigured()) return null;
  const normalized = handle.trim();
  if (!normalized) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.handle, normalized),
    columns: {
      id: true,
      name: true,
      handle: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const recipeRows = await db.query.recipes.findMany({
    where: and(
      isNull(recipes.deletedAt),
      eq(recipes.authorId, user.id),
      eq(recipes.visibility, "public"),
      eq(recipes.status, "published"),
    ),
    orderBy: [desc(recipes.publishedAt), desc(recipes.updatedAt)],
    with: { author: true, tags: { with: { tag: true } } },
  });

  return { user, recipes: recipeRows };
}

/**
 * Handles of cooks with at least one public + published recipe, for the sitemap
 * (issue #327). Only these profiles have indexable content, so unknown/empty
 * profiles are never advertised to crawlers. Returns an empty list when the DB
 * is unconfigured.
 */
export async function listPublicCookHandles(): Promise<string[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .selectDistinct({ handle: users.handle })
    .from(users)
    .innerJoin(recipes, eq(recipes.authorId, users.id))
    .where(
      and(
        isNotNull(users.handle),
        isNull(recipes.deletedAt),
        eq(recipes.visibility, "public"),
        eq(recipes.status, "published"),
      ),
    );
  return rows
    .map((row) => row.handle)
    .filter((handle): handle is string => Boolean(handle));
}
