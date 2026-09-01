import 'server-only';

import { createHash } from 'node:crypto';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';

import { env } from '~/env';
import { db, isDbConfigured } from '~/server/db';
import {
  auditLog,
  comments,
  contentReports,
  deletionRecords,
  notifications,
  ratings,
  reactions,
  recipeCreators,
  recipeVersions,
  recipes,
  usageCounters,
  users,
  waitlistSignups,
  type DeletionTrigger,
} from '~/server/db/schema';
import {
  deleteUserMediaRows,
  isPurgeComplete,
  purgeRecipeCustodiedMedia,
  purgeUserMedia,
} from '~/server/media/purge';
import {
  executeRetainedMediaTransfersInTransaction,
  planRetainedMediaTransfers,
} from '~/server/media/custody';
import { planAccountRecipeRetention } from './recipe-retention';

/**
 * Account and personal-profile deletion (issues #686 and #694).
 *
 * ADR-0009 is the controlling contract. Shared recipe content can remain after
 * the profile and every live identity reference are removed. That retained
 * content may still identify its contributor contextually, so this operation
 * deliberately does not claim unconditional anonymization or full erasure.
 */

/** Ordered erasure counters, keyed by table, written to the tombstone. */
export type ErasureCounts = Record<string, number>;

export type ErasureResult = {
  status: 'erased';
  counts: ErasureCounts;
  /** Recipes owned by someone else that retain the user's contribution. */
  retainedRecipeCount: number;
  /** Formerly owned recipes retained without an owner. */
  unclaimedRecipeCount: number;
  /** User-authored snapshots retained with null attribution. */
  retainedVersionCount: number;
  /** Media assets retained under another lifecycle custodian. */
  transferredAssetCount: number;
  purgedAssetCount: number;
};

export type ErasureOptions = {
  trigger: DeletionTrigger;
  /** Original request time when replaying a legacy hold. */
  requestedAt?: Date;
  /** Number of requests represented by the evidence row. */
  requestCount?: number;
  /** Which confirmation copy the user was shown, when ours showed it. */
  noticeVersion?: string;
  /** When the last backup containing this user expires. */
  backupHorizonAt?: Date;
};

/**
 * One-way, salted digest of an identifier for the tombstone.
 *
 * Salted because a bare SHA-256 of a known cuid2 is trivially confirmable by
 * anyone holding the table: they could test a candidate id and learn that that
 * person was deleted, re-creating exactly the linkage erasure removed. Exported
 * so the backup re-application runbook can re-derive a hash from a restored
 * row's id and match it against the tombstone.
 */
export function hashDeletionSubject(
  value: string,
  salt: string | undefined = env.DELETION_HASH_SALT,
): string | null {
  if (!salt) return null;
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

/**
 * Delete rows and report how many went, so the tombstone can evidence it.
 *
 * `_tx` is unused on purpose: `run` already closes over the transaction. Taking
 * it as a parameter forces every caller to name the transaction it is deleting
 * inside, so an erasure step cannot silently run outside one.
 */
async function deleteCounted(
  _tx: typeof db,
  run: () => Promise<{ id: string }[]>,
): Promise<number> {
  const rows = await run();
  return rows.length;
}

/**
 * Delete the account, personal profile, and non-retained personal data.
 *
 * Order matters and is enforced by schema: `recipes.authorId` and
 * `media_assets.userId` are `restrict`, so a missed step is a loud foreign-key
 * violation rather than a silent cascade that strands CDN bytes.
 *
 * 1. Transfer retained media to its post-deletion lifecycle custodian.
 * 2. Destroy the remaining remote media bytes. Abort if any survive —
 *    a partial deletion the operator can retry is better than deleting the only
 *    rows that name still-live public images.
 * 3. Inside one transaction, retain or delete recipes according to ADR-0009,
 *    scrub personal stores, and delete the `users` row.
 * 4. Verify no live identity reference remains, then write the tombstone.
 */
export async function eraseUserAccount(
  userId: string,
  options: ErasureOptions,
): Promise<ErasureResult> {
  if (!isDbConfigured()) throw new Error('NOT_CONFIGURED');
  if (!env.DELETION_HASH_SALT) throw new Error('DELETION_EVIDENCE_NOT_CONFIGURED');

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, clerkId: true, email: true },
  });
  if (!user) {
    // Already erased. Idempotent by design: a webhook retry after a successful
    // deletion must not throw, or Clerk will keep redelivering forever.
    return {
      status: 'erased',
      counts: {},
      retainedRecipeCount: 0,
      unclaimedRecipeCount: 0,
      retainedVersionCount: 0,
      transferredAssetCount: 0,
      purgedAssetCount: 0,
    };
  }

  const counts: ErasureCounts = {};
  let retainedRecipeCount = 0;
  let unclaimedRecipeCount = 0;
  let retainedVersionCount = 0;
  let transferredAssetCount = 0;
  let purgedAssetCount = 0;

  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    const retention = await planAccountRecipeRetention(userId, t, true);
    const retainedRecipeIds = retention.retainedRecipes.map(({ recipeId }) => recipeId);
    retainedRecipeCount = retention.retainedCoCreatedRecipeIds.length;
    if (retainedRecipeIds.length > 0) {
      const [row] = await t
        .select({ value: count() })
        .from(recipeVersions)
        .where(
          and(
            eq(recipeVersions.authorId, userId),
            inArray(recipeVersions.recipeId, retainedRecipeIds),
          ),
        );
      retainedVersionCount = Number(row?.value ?? 0);
    }

    // The recipe locks acquired by the retention planner stay held through
    // custody, remote purge, and deletion. Creator acceptance/removal takes the
    // same lock, so a destructive classification cannot become stale.
    const mediaPlan = await planRetainedMediaTransfers(userId, retention.retainedRecipes, t);
    const mediaTransfers = await executeRetainedMediaTransfersInTransaction(tx, mediaPlan);
    transferredAssetCount =
      mediaTransfers.transferredToUsers +
      mediaTransfers.transferredToRecipes +
      mediaTransfers.convergedDuplicates;

    const purge = await purgeUserMedia(
      userId,
      t,
      mediaPlan.transfers.flatMap((transfer) =>
        transfer.publicId
          ? [{ publicId: transfer.publicId, resourceType: transfer.resourceType }]
          : [],
      ),
    );
    if (!isPurgeComplete(purge)) {
      throw new Error(
        `MEDIA_PURGE_INCOMPLETE: ${purge.failed.length} asset(s) survived; ` +
          'refusing to delete the rows that identify them.',
      );
    }
    purgedAssetCount = purge.purged;

    // Recipes belonging to *other* people that the user rated. `ratings`
    // cascades, but `recipes.ratingCount`/`ratingSum` are maintained
    // transactionally by mutation code rather than by the DB, so a cascade
    // would leave them permanently overstating a rating that no longer exists.
    const ratedOthers = await t
      .select({ recipeId: ratings.recipeId })
      .from(ratings)
      .where(eq(ratings.userId, userId));
    const recomputeIds = ratedOthers
      .map((r) => r.recipeId)
      .filter((id) => !retention.ownedRecipeIds.includes(id));

    // Other people's replies to the user's comments. `comments.parentId`
    // cascades for thread hygiene, which here would destroy third parties'
    // content as a side effect of *this* user's erasure. Detach them instead;
    // they become top-level rather than disappearing.
    const ownComments = await t
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.userId, userId));
    const ownCommentIds = ownComments.map((c) => c.id);
    if (ownCommentIds.length > 0) {
      const reparented = await t
        .update(comments)
        .set({ parentId: null })
        .where(and(inArray(comments.parentId, ownCommentIds), ne(comments.userId, userId)))
        .returning({ id: comments.id });
      counts.comments_reparented = reparented.length;
    }

    // Reactions other people left on content that is about to be deleted.
    // `reactions.targetId` is polymorphic with no foreign key, so nothing
    // cleans these up automatically and they would linger as orphans.
    if (ownCommentIds.length > 0) {
      counts.reactions_orphaned = await deleteCounted(t, () =>
        t
          .delete(reactions)
          .where(
            and(eq(reactions.targetType, 'comment'), inArray(reactions.targetId, ownCommentIds)),
          )
          .returning({ id: reactions.id }),
      );
    }

    // Shared version and event rows survive with null attribution when the user
    // row is deleted. This is retained collaborative history, not anonymization.

    // Notifications *about* the user on other people's timelines.
    counts.notifications_as_actor = await deleteCounted(t, () =>
      t
        .delete(notifications)
        .where(eq(notifications.actorId, userId))
        .returning({ id: notifications.id }),
    );

    // The security audit log is append-only and survives its actor by design
    // (`actorId` is `set null`), which is a legitimate legal-obligation basis
    // for retention. But the request context and change summaries around it are
    // not: an IP address is personal data on its own, and `metadata` carries
    // before/after values that can include titles the user wrote. Keep the
    // "something was done to this target at this time" skeleton, scrub the rest.
    const scrubbedAudit = await t
      .update(auditLog)
      .set({ ipAddress: null, userAgent: null, metadata: null })
      .where(eq(auditLog.actorId, userId))
      .returning({ id: auditLog.id });
    counts.audit_log_scrubbed = scrubbedAudit.length;

    // Reports the user filed. The row cascades away with them, but `detail` is
    // free text, so scrub before the delete rather than relying on the cascade
    // ordering. Reports filed *against* them are keyed by polymorphic targetId
    // and vanish with the content they describe.
    await t
      .update(contentReports)
      .set({ detail: null })
      .where(eq(contentReports.reporterId, userId));

    // Tables with no foreign key at all, which no cascade can reach.
    counts.usage_counters = await deleteCounted(t, () =>
      t
        .delete(usageCounters)
        .where(and(eq(usageCounters.ownerId, userId), eq(usageCounters.ownerType, 'user')))
        .returning({ id: usageCounters.id }),
    );
    if (user.email) {
      counts.waitlist_signups = await deleteCounted(t, () =>
        t
          .delete(waitlistSignups)
          .where(eq(waitlistSignups.email, user.email!))
          .returning({ id: waitlistSignups.id }),
      );
    }

    counts.media_assets = await deleteUserMediaRows(userId, t);

    if (retention.ownerlessToDeleteIds.length > 0) {
      for (const recipeId of retention.ownerlessToDeleteIds) {
        const mediaPurge = await purgeRecipeCustodiedMedia(recipeId, t, {
          excludedRecipeIds: [...retention.ownedToDeleteIds, ...retention.ownerlessToDeleteIds],
          unclaimedRecipeIds: retention.ownedToUnclaimIds,
        });
        if (!isPurgeComplete(mediaPurge)) {
          throw new Error(
            `MEDIA_PURGE_INCOMPLETE: ${mediaPurge.failed.length} retained asset(s) survived`,
          );
        }
        purgedAssetCount += mediaPurge.purged;
      }
      const deleted = await t
        .update(recipes)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(inArray(recipes.id, retention.ownerlessToDeleteIds))
        .returning({ id: recipes.id });
      counts.recipes_soft_deleted = deleted.length;
    }

    if (retention.ownedToUnclaimIds.length > 0) {
      const unclaimed = await t
        .update(recipes)
        .set({ authorId: null, updatedAt: new Date() })
        .where(and(eq(recipes.authorId, userId), inArray(recipes.id, retention.ownedToUnclaimIds)))
        .returning({ id: recipes.id });
      if (unclaimed.length !== retention.ownedToUnclaimIds.length) {
        throw new Error('RECIPE_RETENTION_CONFLICT');
      }
      const racedOrphans = await t
        .update(recipes)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(
          and(
            inArray(recipes.id, retention.ownedToUnclaimIds),
            ne(recipes.visibility, 'public'),
            sql`not exists (
              select 1 from ${recipeCreators}
              where ${recipeCreators.recipeId} = ${recipes.id}
                and ${recipeCreators.status} = 'accepted'
            )`,
          ),
        )
        .returning({ id: recipes.id });
      counts.recipes_soft_deleted = (counts.recipes_soft_deleted ?? 0) + racedOrphans.length;
      unclaimedRecipeCount = unclaimed.length - racedOrphans.length;
      counts.recipes_unclaimed = unclaimedRecipeCount;
    }

    if (retention.ownedToDeleteIds.length > 0) {
      counts.recipes = await deleteCounted(t, () =>
        t
          .delete(recipes)
          .where(and(eq(recipes.authorId, userId), inArray(recipes.id, retention.ownedToDeleteIds)))
          .returning({ id: recipes.id }),
      );
    }

    // The user row removes every remaining live identity reference. Retained
    // collaborative history follows its set-null foreign keys.
    counts.users = await deleteCounted(t, () =>
      t.delete(users).where(eq(users.id, userId)).returning({ id: users.id }),
    );

    // Rating aggregates on other people's recipes, recomputed from what is
    // actually left rather than decremented, so a prior drift is corrected too.
    if (recomputeIds.length > 0) {
      await t
        .update(recipes)
        .set({
          ratingCount: sql`(select count(*) from ${ratings} where ${ratings.recipeId} = ${recipes.id})`,
          ratingSum: sql`(select coalesce(sum(${ratings.value}), 0) from ${ratings} where ${ratings.recipeId} = ${recipes.id})`,
        })
        .where(inArray(recipes.id, recomputeIds));
      counts.recipes_rating_recomputed = recomputeIds.length;
    }

    await writeDeletionRecord(t, user.id, user.clerkId, options, {
      counts,
      retainedRecipeCount,
      unclaimedRecipeCount,
      retainedVersionCount,
      transferredAssetCount,
      purgedAssetCount,
    });
  });

  // --- Step 3: verify the committed result. ---
  await assertUserErased(userId);

  return {
    status: 'erased',
    counts,
    retainedRecipeCount,
    unclaimedRecipeCount,
    retainedVersionCount,
    transferredAssetCount,
    purgedAssetCount,
  };
}

/**
 * Fail loudly if any row that *names* the user survived.
 *
 * An erasure that silently half-succeeded is the worst outcome available: the
 * user is told their data is gone, the tombstone says so, and the residue is
 * never looked at again. This runs after the transaction commits, so it reads
 * the real post-state rather than the transaction's own view.
 *
 * Read the guarantee narrowly. This checks for surviving *rows keyed to the
 * user*; it cannot check for surviving *text*. Free text the user contributed to
 * a recipe someone else owns has no column naming them once their creator row
 * cascades away, so it passes this check by construction — the exact scenario
 * the paragraph above calls the worst outcome available. That is a known gap
 * (#694), not something this function can be tightened to catch: detecting it
 * requires the contribution revert that #678 has to decide on. Do not treat a
 * clean return here as evidence that no personal data remains.
 */
export async function assertUserErased(userId: string): Promise<void> {
  const [remaining] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (remaining) {
    throw new Error(`ERASURE_INCOMPLETE: users row ${userId} survived`);
  }

  const [orphanRecipe] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.authorId, userId))
    .limit(1);
  if (orphanRecipe) {
    throw new Error(`ERASURE_INCOMPLETE: recipes still authored by ${userId}`);
  }
}

/**
 * Record that the erasure happened, using only hashes and counts.
 *
 * Written in the erasure transaction so evidence and deletion commit together.
 * A missing salt or failed insert aborts the transaction rather than silently
 * completing an erasure that cannot be evidenced or replayed after restore.
 */
async function writeDeletionRecord(
  executor: typeof db,
  userId: string,
  clerkId: string | null,
  options: ErasureOptions,
  result: Omit<ErasureResult, 'status'>,
): Promise<void> {
  const subjectHash = hashDeletionSubject(userId);
  if (!subjectHash) throw new Error('DELETION_EVIDENCE_NOT_CONFIGURED');

  const now = new Date();
  await executor
    .insert(deletionRecords)
    .values({
      subjectHash,
      clerkIdHash: clerkId ? hashDeletionSubject(clerkId) : null,
      trigger: options.trigger,
      requestedAt: options.requestedAt ?? now,
      requestCount: options.requestCount ?? 1,
      completedAt: now,
      deletedCounts: result.counts,
      retainedRecipeCount: result.retainedRecipeCount,
      unclaimedRecipeCount: result.unclaimedRecipeCount,
      retainedVersionCount: result.retainedVersionCount,
      transferredAssetCount: result.transferredAssetCount,
      purgedAssetCount: result.purgedAssetCount,
      backupHorizonAt: options.backupHorizonAt ?? null,
      noticeVersion: options.noticeVersion ?? null,
    })
    .onConflictDoNothing({ target: deletionRecords.subjectHash });
}

/**
 * Whether a subject has already been erased, checked without any identifier
 * surviving in the tombstone. Used to make a repeat `user.deleted` webhook a
 * no-op after the local row is gone.
 */
export async function hasBeenErased(clerkId: string): Promise<boolean> {
  const hash = hashDeletionSubject(clerkId);
  if (!hash) return false;
  const [row] = await db
    .select({ id: deletionRecords.id })
    .from(deletionRecords)
    .where(eq(deletionRecords.clerkIdHash, hash))
    .limit(1);
  return Boolean(row);
}
