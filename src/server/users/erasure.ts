import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { env } from "~/env";
import { db, isDbConfigured } from "~/server/db";
import {
  auditLog,
  comments,
  contentReports,
  deletionRecords,
  notifications,
  ratings,
  reactions,
  recipeCreators,
  recipeEvents,
  recipeVersions,
  recipes,
  usageCounters,
  users,
  waitlistSignups,
  type DeletionTrigger,
} from "~/server/db/schema";
import {
  deleteUserMediaRows,
  isPurgeComplete,
  purgeUserMedia,
} from "~/server/media/purge";

/**
 * Account erasure (issue #678).
 *
 * Replaces the anonymize-only path this app shipped with. That path kept the
 * `users` row alive with a stable id and every foreign key still pointing at
 * it, which is pseudonymization, not anonymization: the data stayed personal
 * data (GDPR Recital 26) and the erasure request went unremedied.
 *
 * The controlling policy, confirmed by the product owner:
 *
 * > Account deletion is a **full data deletion**, not anonymization. Recipes
 * > are free text and cannot be reliably scrubbed of PII — titles, stories,
 * > notes, journal entries, fork notes, cook-log entries and photos all carry
 * > it — so removal is the only defensible control.
 *
 * **The co-creator exception.** A recipe with other creators survives; only the
 * departing user's creator link is removed. Today that exception can only ever
 * apply in the direction that is safe. `recipe_creators` grants read and a
 * mirrored namespace, and every write path still gates on
 * `eq(recipes.authorId, …)`, so a non-owner creator has authored none of the
 * recipe's free text. Removing their row genuinely erases everything of theirs
 * that the recipe holds.
 *
 * The reverse — an *owner* departing a co-created recipe — is deliberately NOT
 * treated as survival. The entire body is the owner's personal data, so
 * "survives with the byline removed" would retain 100% of their free text under
 * someone else's namespace: exactly the pseudonymization failure that motivated
 * full deletion. The owner's recipes are therefore deleted, and the departing
 * owner is offered ownership transfer *before* confirming, so retention becomes
 * their consented act rather than a silent default. See PR B for that notice.
 *
 * **Cross-owner editing has shipped, and this reasoning has expired.** #685 lets
 * an accepted co-creator edit the recipe body, so U's prose can now live inside
 * a recipe someone else owns: in `recipes.story`, `notes` and step text, and
 * invisibly in every `recipe_versions.snapshot` written by other users after
 * U's edit. No author-scoped delete reaches either, so this function does not
 * fully erase U's free text from recipes it retains. That is a known gap,
 * tracked on #678 with four candidate remedies, and the pre-confirmation notice
 * discloses it rather than claiming an erasure that does not happen.
 *
 * `recipe_versions` carries `authorId` plus a full snapshot per save, so the
 * text U introduced is derivable by diffing U's versions against their
 * predecessors. Note the ordering hazard: this function deletes U's version
 * rows, which destroys that diff basis. Any revert must be computed and applied
 * *before* that delete, and once a deletion has run the remedy is unavailable
 * for that user forever.
 *
 * **Pending creators are not creators.** A `pending` invitation grants nothing
 * and has no slug, so it never makes a recipe "co-created" for survival
 * purposes.
 *
 * **Freed slugs.** The user's slug and all their aliases are deleted with the
 * account (cascade), so previously shared `/recipes/<their-slug>/<recipe>` URLs
 * 404 rather than redirect. 404, not 410: a 410 would confirm that a recipe
 * once existed at that URL, breaking the invariant from #666 that an
 * unauthorized viewer is indistinguishable from a nonexistent one.
 *
 * The slugs then become claimable again by anyone. That is an accepted risk,
 * decided by the product owner over the alternative of reserving them forever:
 * an old link into a departed user's namespace could later land in a stranger's
 * namespace. It is contained by the resolver being exact-match only — it never
 * soft-matches or falls back to a same-named recipe belonging to the new
 * holder — which is asserted by a dedicated test. See ADR 0002.
 */

/** Ordered erasure counters, keyed by table, written to the tombstone. */
export type ErasureCounts = Record<string, number>;

export type ErasureResult = {
  counts: ErasureCounts;
  /** Recipes kept because the user was a non-owner creator on them. */
  retainedRecipeCount: number;
  purgedAssetCount: number;
};

export type ErasureOptions = {
  trigger: DeletionTrigger;
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
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

/** Delete rows and report how many went, so the tombstone can evidence it. */
async function deleteCounted(
  tx: typeof db,
  run: () => Promise<{ id: string }[]>,
): Promise<number> {
  const rows = await run();
  return rows.length;
}

/**
 * Erase every trace of a user.
 *
 * Order matters and is enforced by schema: `recipes.authorId` and
 * `media_assets.userId` are `restrict`, so a missed step is a loud foreign-key
 * violation rather than a silent cascade that strands CDN bytes.
 *
 * 1. Destroy the remote media bytes. Abort the whole erasure if any survive —
 *    a partial deletion the operator can retry is better than deleting the only
 *    rows that name still-live public images.
 * 2. Inside one transaction, remove or scrub everything reachable, then delete
 *    the `users` row, letting the ~139 cascading foreign keys do the bulk work.
 * 3. Verify nothing is left, then write the tombstone.
 */
export async function eraseUserAccount(
  userId: string,
  options: ErasureOptions,
): Promise<ErasureResult> {
  if (!isDbConfigured()) throw new Error("NOT_CONFIGURED");

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, clerkId: true, email: true },
  });
  if (!user) {
    // Already erased. Idempotent by design: a webhook retry after a successful
    // deletion must not throw, or Clerk will keep redelivering forever.
    return { counts: {}, retainedRecipeCount: 0, purgedAssetCount: 0 };
  }

  // --- Step 1: remote bytes, before any row that names them disappears. ---
  const purge = await purgeUserMedia(userId);
  if (!isPurgeComplete(purge)) {
    throw new Error(
      `MEDIA_PURGE_INCOMPLETE: ${purge.failed.length} asset(s) survived; ` +
        "refusing to delete the rows that identify them.",
    );
  }

  const counts: ErasureCounts = {};
  let retainedRecipeCount = 0;

  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;

    // Recipes the user owns. These are deleted; recipes where they are merely
    // an accepted creator are not, and their creator row cascades away with the
    // account, which is what removes their attribution and mirrored namespace.
    const owned = await t
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.authorId, userId));
    const ownedIds = owned.map((r) => r.id);

    const coCreated = await t
      .select({ recipeId: recipeCreators.recipeId })
      .from(recipeCreators)
      .where(
        and(
          eq(recipeCreators.userId, userId),
          eq(recipeCreators.status, "accepted"),
        ),
      );
    retainedRecipeCount = coCreated.filter(
      (row) => !ownedIds.includes(row.recipeId),
    ).length;

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
      .filter((id) => !ownedIds.includes(id));

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
        .where(
          and(
            inArray(comments.parentId, ownCommentIds),
            ne(comments.userId, userId),
          ),
        )
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
            and(
              eq(reactions.targetType, "comment"),
              inArray(reactions.targetId, ownCommentIds),
            ),
          )
          .returning({ id: reactions.id }),
      );
    }

    // Free text on *other people's* recipes. `recipe_versions.authorId` and
    // `recipe_events.actorId` are `set null`, so a cascade would leave the
    // user's prose sitting in a jsonb snapshot with the attribution removed —
    // pseudonymized, not erased, and invisible to any column-level scrub.
    counts.recipe_versions = await deleteCounted(t, () =>
      t
        .delete(recipeVersions)
        .where(eq(recipeVersions.authorId, userId))
        .returning({ id: recipeVersions.id }),
    );
    counts.recipe_events = await deleteCounted(t, () =>
      t
        .delete(recipeEvents)
        .where(eq(recipeEvents.actorId, userId))
        .returning({ id: recipeEvents.id }),
    );

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
        .where(
          and(
            eq(usageCounters.ownerId, userId),
            eq(usageCounters.ownerType, "user"),
          ),
        )
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

    // Media bookkeeping, now that the bytes it named are destroyed. Must precede
    // the `users` delete because `media_assets.userId` is `restrict`.
    counts.media_assets = await deleteUserMediaRows(userId);

    // The user's own recipes, and with them (by cascade) every step, ingredient,
    // version, event, alias, creator invitation, comment, rating and review that
    // hangs off them. Must precede the `users` delete: `recipes.authorId` is
    // `restrict` precisely so forgetting this is a loud error.
    if (ownedIds.length > 0) {
      counts.recipes = await deleteCounted(t, () =>
        t
          .delete(recipes)
          .where(eq(recipes.authorId, userId))
          .returning({ id: recipes.id }),
      );
    }

    // The row itself. Everything still referencing it cascades from here.
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
  });

  // --- Step 3: verify, then evidence. ---
  await assertUserErased(userId);
  await writeDeletionRecord(user.id, user.clerkId, options, {
    counts,
    retainedRecipeCount,
    purgedAssetCount: purge.purged,
  });

  return { counts, retainedRecipeCount, purgedAssetCount: purge.purged };
}

/**
 * Fail loudly if anything survived.
 *
 * An erasure that silently half-succeeded is the worst outcome available: the
 * user is told their data is gone, the tombstone says so, and the residue is
 * never looked at again. This runs after the transaction commits, so it reads
 * the real post-state rather than the transaction's own view.
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
 * Best-effort and non-fatal: the data is already gone, and throwing here would
 * make a caller retry an erasure that fully succeeded. A missing salt skips the
 * record entirely rather than writing a guessable digest.
 */
async function writeDeletionRecord(
  userId: string,
  clerkId: string | null,
  options: ErasureOptions,
  result: ErasureResult,
): Promise<void> {
  const subjectHash = hashDeletionSubject(userId);
  if (!subjectHash) return;

  const now = new Date();
  try {
    await db
      .insert(deletionRecords)
      .values({
        subjectHash,
        clerkIdHash: clerkId ? hashDeletionSubject(clerkId) : null,
        trigger: options.trigger,
        requestedAt: now,
        completedAt: now,
        deletedCounts: result.counts,
        retainedRecipeCount: result.retainedRecipeCount,
        purgedAssetCount: result.purgedAssetCount,
        backupHorizonAt: options.backupHorizonAt ?? null,
        noticeVersion: options.noticeVersion ?? null,
      })
      .onConflictDoNothing({ target: deletionRecords.subjectHash });
  } catch {
    // Swallow: the erasure itself is complete and must not be re-run.
  }
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
