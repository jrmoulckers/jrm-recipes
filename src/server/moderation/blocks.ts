import "server-only";

import { and, eq, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { DomainError } from "~/server/errors";
import { userBlocks, type User } from "~/server/db/schema";

/**
 * Personal blocks (issue #355). A block is a private, reversible record: the
 * blocker never sees the blocked user's comments, reviews, reactions, or cook
 * posts again. Filtering is symmetric ("vice-versa where appropriate") so a
 * blocked user also can't see the blocker's content — this avoids one-sided
 * conversations that would out the block.
 */

/** Block another member. No-ops if already blocked; you can't block yourself. */
export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new DomainError("FORBIDDEN");
  await db
    .insert(userBlocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing({
      target: [userBlocks.blockerId, userBlocks.blockedId],
    });
}

/** Reverse a block. Silently succeeds even if no block existed. */
export async function unblockUser(blockerId: string, blockedId: string) {
  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerId, blockerId),
        eq(userBlocks.blockedId, blockedId),
      ),
    );
}

/**
 * User ids whose content should be hidden from `userId`: everyone they've
 * blocked, plus everyone who's blocked them (symmetric). Returned as a Set for
 * O(1) membership tests in list-filtering. Empty for signed-out viewers.
 */
export async function getHiddenAuthorIds(
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!isDbConfigured() || !userId) return new Set();
  const rows = await db.query.userBlocks.findMany({
    where: or(
      eq(userBlocks.blockerId, userId),
      eq(userBlocks.blockedId, userId),
    ),
    columns: { blockerId: true, blockedId: true },
  });
  const hidden = new Set<string>();
  for (const row of rows) {
    hidden.add(row.blockerId === userId ? row.blockedId : row.blockerId);
  }
  return hidden;
}

/** Just the ids `userId` has actively blocked (for the settings list order). */
export async function getBlockedIds(
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!isDbConfigured() || !userId) return new Set();
  const rows = await db.query.userBlocks.findMany({
    where: eq(userBlocks.blockerId, userId),
    columns: { blockedId: true },
  });
  return new Set(rows.map((r) => r.blockedId));
}

/** A blocked person, shaped for the "Blocked people" settings list (#355). */
export type BlockedPerson = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  blockedAt: Date;
};

/** The people `viewer` has blocked, most recent first, for the settings page. */
export async function listBlockedPeople(
  viewer: User,
): Promise<BlockedPerson[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.userBlocks.findMany({
    where: eq(userBlocks.blockerId, viewer.id),
    with: {
      blocked: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });
  return rows
    .filter((row) => row.blocked)
    .map((row) => ({
      id: row.blocked!.id,
      name: row.blocked!.name,
      handle: row.blocked!.handle,
      avatarUrl: row.blocked!.avatarUrl,
      blockedAt: row.createdAt,
    }))
    .sort((a, b) => b.blockedAt.getTime() - a.blockedAt.getTime());
}

/** Filter a list of authored items, dropping any whose author is hidden. */
export function filterBlocked<T>(
  items: T[],
  authorIdOf: (item: T) => string | null | undefined,
  hidden: Set<string>,
): T[] {
  if (hidden.size === 0) return items;
  return items.filter((item) => {
    const authorId = authorIdOf(item);
    return !authorId || !hidden.has(authorId);
  });
}

/** Are any of these user ids hidden from the viewer? (small helper for tests) */
export function anyHidden(ids: string[], hidden: Set<string>): boolean {
  return ids.some((id) => hidden.has(id));
}
