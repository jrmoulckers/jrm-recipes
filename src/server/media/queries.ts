import "server-only";

import { and, desc, eq, isNull, lt } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { mediaAssets, type MediaAsset, type User } from "~/server/db/schema";
import { MEDIA_PAGE_SIZE } from "./validation";

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
