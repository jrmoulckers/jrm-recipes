import 'server-only';

import { asc, eq, isNull } from 'drizzle-orm';

import { log } from '~/lib/log';
import { db } from '~/server/db';
import { erasureHolds, users } from '~/server/db/schema';
import { eraseUserAccount } from './erasure';

export type ErasureReplayResult = {
  attempted: number;
  erased: number;
  failed: number;
};

/**
 * Replay requests recorded before ADR-0009 supplied a safe shared-content
 * policy. Counts only leave this boundary; subject identifiers never do.
 */
export async function replayOpenErasureHolds(limit = 25): Promise<ErasureReplayResult> {
  const batchSize = Math.max(1, Math.min(limit, 100));
  const holds = await db
    .select({
      userId: erasureHolds.userId,
      trigger: erasureHolds.trigger,
      noticeVersion: erasureHolds.noticeVersion,
      firstRequestedAt: erasureHolds.firstRequestedAt,
      requestCount: erasureHolds.requestCount,
      clerkId: users.clerkId,
    })
    .from(erasureHolds)
    .innerJoin(users, eq(users.id, erasureHolds.userId))
    .where(isNull(erasureHolds.releasedAt))
    .orderBy(asc(erasureHolds.firstRequestedAt))
    .limit(batchSize);

  let erased = 0;
  let failed = 0;
  for (const hold of holds) {
    try {
      await eraseUserAccount(hold.userId, {
        trigger: hold.trigger,
        noticeVersion: hold.noticeVersion ?? undefined,
        requestedAt: hold.firstRequestedAt,
        requestCount: hold.requestCount,
      });
      // Local-first prevents a provider success plus database failure from
      // locking the subject out while their data remains. The deletion
      // tombstone blocks lazy recreation if provider cleanup needs a retry.
      if (hold.clerkId && hold.trigger !== 'clerk_webhook') {
        try {
          const { clerkClient } = await import('@clerk/nextjs/server');
          const client = await clerkClient();
          await client.users.deleteUser(hold.clerkId);
        } catch {
          log.error('erasure.replay_clerk_cleanup_failed', {
            trigger: hold.trigger,
          });
        }
      }
      erased += 1;
    } catch {
      failed += 1;
      log.error('erasure.replay_failed', {
        trigger: hold.trigger,
      });
    }
  }

  return { attempted: holds.length, erased, failed };
}
