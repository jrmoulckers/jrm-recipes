import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '~/server/db';
import { DomainError } from '~/server/errors';
import { getHiddenAuthorIds } from '~/server/moderation/blocks';
import { notify } from '~/server/notifications/notify';
import { follows, users } from '~/server/db/schema';

/**
 * The public follow graph (opt-in, privacy-preserving). A follow only ever
 * grants visibility into the followee's *public* activity, and only when the
 * followee has turned on {@link users.publicActivityOptIn}. Blocks always win:
 * a block in either direction makes the follow impossible (and severs an
 * existing one's feed visibility on the read side).
 */

/**
 * Follow another cook. Enforces every privacy invariant before writing:
 *
 * - you can't follow yourself (`FORBIDDEN`).
 * - the target must exist and have opted in to a public profile
 *   (`USER_NOT_FOUND` / `FORBIDDEN`).
 * - a block in either direction blocks the follow (`FORBIDDEN`).
 *
 * Idempotent (`onConflictDoNothing`), and only a genuinely new edge notifies the
 * followee. Re-following an already-followed user is a silent no-op.
 */
export async function followUser(followerId: string, followeeId: string) {
  if (followerId === followeeId) throw new DomainError('FORBIDDEN');

  const followee = await db.query.users.findFirst({
    where: eq(users.id, followeeId),
    columns: { id: true, publicActivityOptIn: true, deletedAt: true },
  });
  // Unknown or deleted accounts aren't followable.
  if (!followee || followee.deletedAt) throw new DomainError('USER_NOT_FOUND');
  // Opt-in gate: you can only follow someone who has made their profile public.
  if (!followee.publicActivityOptIn) throw new DomainError('FORBIDDEN');

  // Blocks win over follows, in both directions (symmetric hidden set).
  const hidden = await getHiddenAuthorIds(followerId);
  if (hidden.has(followeeId)) throw new DomainError('FORBIDDEN');

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(follows)
      .values({ followerId, followeeId })
      .onConflictDoNothing({
        target: [follows.followerId, follows.followeeId],
      })
      .returning({ id: follows.id });

    // Notify only on a genuine new follow (not a re-follow race / no-op).
    if (inserted.length > 0) {
      await notify(tx, {
        recipientId: followeeId,
        actorId: followerId,
        type: 'follow',
      });
    }
  });
}

/** Unfollow a cook. Silently succeeds even if no edge existed. */
export async function unfollowUser(followerId: string, followeeId: string) {
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
}
