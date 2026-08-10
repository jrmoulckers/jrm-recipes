import "server-only";

import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  collections,
  cookLogEntries,
  groupMembers,
  groups,
  mediaAssets,
  recipeSteps,
  recipes,
  reviews,
  type MediaAsset,
  type User,
} from "~/server/db/schema";
import { MEDIA_PAGE_SIZE } from "./validation";
import type { AssetUsage, AssetUsageSurface } from "./usage-surfaces";

export type { AssetUsage, AssetUsageSurface };

/**
 * Read side of the media library (issue #657). Every query is scoped to the
 * caller: there is no cross-user read path here by design.
 */

export type MediaPage = {
  assets: MediaAsset[];
  /** `createdAt` of the last row, or null when this is the final page. */
  nextCursor: string | null;
};

/**
 * A page of the caller's live assets, newest first. Keyset-paginated on
 * `createdAt` (with `id` as the tiebreaker) rather than OFFSET, so the grid
 * stays stable and cheap as a library grows.
 */
export async function listAssets(
  user: User,
  { cursor, limit }: { cursor?: string; limit?: number } = {},
): Promise<MediaPage> {
  if (!isDbConfigured()) return { assets: [], nextCursor: null };

  const pageSize = limit ?? MEDIA_PAGE_SIZE;
  const cursorDate = cursor ? new Date(cursor) : null;
  const validCursor =
    cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : null;

  const rows = await db.query.mediaAssets.findMany({
    where: and(
      eq(mediaAssets.userId, user.id),
      isNull(mediaAssets.deletedAt),
      validCursor ? lt(mediaAssets.createdAt, validCursor) : undefined,
    ),
    orderBy: [desc(mediaAssets.createdAt), desc(mediaAssets.id)],
    // Fetch one extra to learn whether another page exists without a COUNT.
    limit: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const assets = hasMore ? rows.slice(0, pageSize) : rows;
  const last = assets.at(-1);

  return {
    assets,
    nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
  };
}

/** A single asset the caller owns, or null. */
export async function getAsset(
  id: string,
  user: User,
): Promise<MediaAsset | null> {
  if (!isDbConfigured()) return null;

  const asset = await db.query.mediaAssets.findFirst({
    where: and(
      eq(mediaAssets.id, id),
      eq(mediaAssets.userId, user.id),
      isNull(mediaAssets.deletedAt),
    ),
  });
  return asset ?? null;
}

/**
 * Which surfaces still point at an asset's URL (issue #658).
 *
 * The library links to content by URL rather than by foreign key (see
 * `media_assets`), so "is this photo still in use?" is answered by matching the
 * stored URL across the six columns that can hold one. Each is a single indexed
 * lookup, and the whole thing runs only when the delete confirm dialog opens —
 * never on grid render, where it would be six queries per thumbnail.
 *
 * **Every count is scoped to what the caller can already see.** An unrestricted
 * count is an information leak, not a convenience: "used in 3 groups" would
 * reveal the existence and state of groups the caller was removed from, or was
 * never in. So `groups` is restricted to the caller's own memberships, and the
 * other five to rows the caller owns outright. Undercounting a surface someone
 * else controls is the safe direction to be wrong in — the warning is advisory,
 * and the delete never cascades either way.
 *
 * Missing and foreign-owned assets both throw `NOT_FOUND`, matching the
 * convention in `mutations.ts` so this can't be used as an existence oracle.
 */

async function countRows(
  run: () => Promise<{ value: number }[]>,
): Promise<number> {
  const [row] = await run();
  return row?.value ?? 0;
}

export async function getAssetUsage(
  id: string,
  user: User,
): Promise<AssetUsage> {
  if (!isDbConfigured()) throw new Error("NOT_FOUND");

  const asset = await getAsset(id, user);
  if (!asset) throw new Error("NOT_FOUND");

  const url = asset.url;

  // Groups the caller actually belongs to. Everything else about a group —
  // that it exists, that it uses this photo — stays invisible to a non-member.
  const visibleGroups = db
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, user.id));

  const [
    recipeCount,
    stepCount,
    collectionCount,
    groupCount,
    cookLogCount,
    reviewCount,
  ] = await Promise.all([
    countRows(() =>
      db
        .select({ value: count() })
        .from(recipes)
        .where(
          and(
            eq(recipes.coverImageUrl, url),
            eq(recipes.authorId, user.id),
            // A recipe in the trash is not a live use of the photo.
            isNull(recipes.deletedAt),
          ),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(recipeSteps)
        .innerJoin(recipes, eq(recipes.id, recipeSteps.recipeId))
        .where(
          and(
            eq(recipeSteps.imageUrl, url),
            eq(recipes.authorId, user.id),
            isNull(recipes.deletedAt),
          ),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(collections)
        .where(
          and(
            eq(collections.coverImageUrl, url),
            eq(collections.userId, user.id),
          ),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(groups)
        .where(and(eq(groups.avatarUrl, url), inArray(groups.id, visibleGroups))),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(cookLogEntries)
        .where(
          and(
            eq(cookLogEntries.photoUrl, url),
            eq(cookLogEntries.userId, user.id),
          ),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(reviews)
        .where(and(eq(reviews.photoUrl, url), eq(reviews.userId, user.id))),
    ),
  ]);

  const bySurface: Record<AssetUsageSurface, number> = {
    recipes: recipeCount,
    steps: stepCount,
    collections: collectionCount,
    groups: groupCount,
    cookLog: cookLogCount,
    reviews: reviewCount,
  };

  return {
    total: Object.values(bySurface).reduce((sum, n) => sum + n, 0),
    bySurface,
  };
}
