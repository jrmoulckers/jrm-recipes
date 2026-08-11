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
import {
  findEntanglement,
  recordErasureHold,
} from "~/server/users/erasure-holds";

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
 * **Containment, pending that remedy (#694).** Because the loss is permanent
 * and the remedy is undecided, an erasure that touches a co-created recipe no
 * longer runs at all. `findEntanglement` is evaluated ahead of every
 * destructive step — including the media purge and the `users` delete, since
 * `recipe_versions.authorId` is `set null` and the account delete severs the
 * basis on its own — and an entangled request is recorded in `erasure_holds`
 * instead of executed. That is a decision about *when* erasure runs, not about
 * what it means: no retention is added, and the request stays durable,
 * countable and replayable. See ADR 0004.
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
  /**
   * `erased` — the account is gone. `held` — nothing was deleted, because
   * executing this request would have destroyed the only evidence needed to
   * remedy the co-creator gap (#694). A held request is recorded in
   * `erasure_holds` and is replayable once a remedy lands.
   */
  status: "erased" | "held";
  counts: ErasureCounts;
  /**
   * Recipes kept because the user was a non-owner creator on them.
   *
   * As a remediation estimate this is an **upper bound**, not a count of
   * recipes carrying the user's residue (#728): it counts recipes they could
   * have edited, not ones they did. See the derivation in `eraseUserAccount`.
   */
  retainedRecipeCount: number;
  purgedAssetCount: number;
  /** Populated only when `status` is `held`. The remedy worklist. */
  entangledRecipeIds?: string[];
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
 * 0. Halt if erasing this user would destroy the co-creator diff basis (#694).
 *    Nothing is deleted; the request is recorded as a hold and replayed later.
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
    return {
      status: "erased",
      counts: {},
      retainedRecipeCount: 0,
      purgedAssetCount: 0,
    };
  }

  // --- Step 0: containment, before anything is destroyed (#694). ---
  //
  // Every step below this line is irreversible, and two of them destroy the
  // only record of which words in a co-created recipe were this user's: the
  // explicit `recipe_versions` delete, and the `users` delete, which severs
  // `recipe_versions.authorId` because that column is `ON DELETE set null`.
  // Ordering alone does not contain the second one, so the halt has to sit
  // ahead of both — and ahead of the media purge, which is equally final.
  //
  // This is not a decision about what erasure means. It is a decision about
  // when it runs: nothing that would otherwise be kept is deleted, and nothing
  // that would otherwise be deleted is kept. The request is held, recorded and
  // replayable, instead of being executed in the one way that cannot be undone.
  //
  // THIS EARLY RETURN IS LOAD-BEARING FOR EVERY DESTRUCTIVE STATEMENT BELOW
  // (#797). None of them carries a local entanglement check, because a correct
  // "halt before anything is destroyed" cannot be expressed at any one of them.
  // Its dependents are the media purge (Step 1), the `recipe_versions` delete
  // and the `users` delete; each names this block in turn. Removing or narrowing
  // this return silently re-opens the irreversible window at all three at once,
  // so `erasure.test.ts` pins it — see "deletes nothing at all when the user is
  // entangled" and "checks entanglement before the media purge, not after".
  const entanglement = await findEntanglement(userId);
  if (entanglement.recipeIds.length > 0) {
    await recordErasureHold(userId, entanglement, options);
    return {
      status: "held",
      counts: {},
      retainedRecipeCount: 0,
      purgedAssetCount: 0,
      entangledRecipeIds: entanglement.recipeIds,
    };
  }

  // --- Step 1: remote bytes, before any row that names them disappears. ---
  //
  // Unguarded here by design (#797): entangled users returned in Step 0, above.
  // Media deletion is as irreversible as the row deletes, so the halt precedes
  // it too — a held account keeps its photos, not just its version rows.
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
    // account, which removes their attribution and mirrored namespace.
    //
    // Removing the attribution is not the same as removing the contribution.
    // Since #685 an accepted creator can edit the body of a recipe they do not
    // own, so what survives here is their prose in someone else's `story`,
    // `notes` and step text with their name detached from it — pseudonymized,
    // which is the same failure this file rejects a few statements below when a
    // cascade would do it to `recipe_versions`. `retainedRecipeCount` records
    // the scale of this on the tombstone, even though the residue is not
    // addressed. See #694 and #678.
    //
    // Read that number as an UPPER BOUND, not a count of affected recipes
    // (#728). It is accepted creator rows minus owned ones, so it counts the
    // recipes the user *could* have edited, not the ones they did — accepting
    // an invite and editing prose are different acts. Two things follow:
    //
    //   1. When remediation eventually runs, a remediated count lower than this
    //      is the expected gap, not evidence of a missed recipe.
    //   2. The ordering hazard applies to *measuring* the problem, not only to
    //      fixing it. Tightening this bound — working out which of these
    //      recipes the user actually edited — needs rows keyed to them that
    //      this function destroys. So every erasure narrows both the remedy and
    //      the estimate of how much remedy was needed. The bound survives on
    //      the tombstone; the ability to tighten it does not.
    //
    //      There are TWO such bases and they need DIFFERENT treatment (#736):
    //
    //      `recipe_versions.authorId` gives the diff, and is destroyed by the
    //      explicit delete below. Ordering is sufficient: compute above that
    //      line and the rows are intact.
    //
    //      `recipe_events.actorId` gives which recipes were edited at all —
    //      `updateRecipe` writes an "updated" event per edit, and since #685
    //      that actor can be a co-creator on a recipe they do not own. Ordering
    //      is NOT sufficient here. That column is `ON DELETE set null`, so the
    //      `users` delete at the end of this transaction severs it even if the
    //      explicit delete below were removed. The rows survive with the actor
    //      detached — pseudonymized, not retained, the same distinction drawn
    //      above. Preserving this basis takes an affirmative capture step, not
    //      merely a later delete.
    //
    //      A remedy that treats "compute above the delete" as the whole
    //      constraint gets the first right and the second wrong, and fails
    //      silently: the query still returns rows, they are just all detached.
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

    // Snapshot copies of the user's free text on *other people's* recipes.
    // `recipe_versions.authorId` and `recipe_events.actorId` are `set null`, so a
    // cascade would leave the user's prose sitting in a jsonb snapshot with the
    // attribution removed — pseudonymized, not erased, and invisible to any
    // column-level scrub.
    //
    // Read the scope narrowly: this deletes the *versions*, not the text the user
    // merged into the live row. Since #685 an accepted co-creator can edit a
    // recipe they do not own, so their words can sit in another user's
    // `recipes.story`, `notes` and step text, which nothing below reaches. This
    // statement does not remedy that and must not be read as if it does (#694).
    //
    // ORDERING CONSTRAINT (#678): these rows are the only record of which words
    // this user introduced into a recipe someone else owns, and deleting them
    // destroys the basis for computing that. If a contribution revert is ever
    // added, it must be computed AND applied above this line. Placing it below
    // would diff against rows that no longer exist and silently revert nothing,
    // which reports success while leaving the text in place. Every deletion that
    // runs without such a step forecloses the remedy for that user permanently.
    //
    // GUARDED BY STEP 0, NOT BY ANYTHING HERE (#797). There is deliberately no
    // condition on this statement: entangled users return at the `status: "held"`
    // early return in Step 0, above the transaction, so this line is unreachable
    // for exactly the users whose diff basis it would destroy. Do not read the
    // absence of a local check as an absence of containment, and do not add a
    // second one here — the halt has to precede the media purge and the `users`
    // delete too, so it cannot live at any single destructive statement.
    counts.recipe_versions = await deleteCounted(t, () =>
      t
        .delete(recipeVersions)
        .where(eq(recipeVersions.authorId, userId))
        .returning({ id: recipeVersions.id }),
    );
    // Timeline events this user caused. `updateRecipe` writes an "updated"
    // event per edit, so these rows are the second measurement basis described
    // at the top of this function (#736): which recipes a co-creator edited,
    // as distinct from which words they wrote.
    //
    // Unlike the statement above, removing THIS delete would not preserve that
    // basis. `recipeEvents.actorId` is `ON DELETE set null`, so the `users`
    // delete at the end of this transaction detaches the rows anyway. Retaining
    // the linkage takes an affirmative capture step before that point.
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
    //
    // This is the second evidence-destruction path, and the quiet one (#797):
    // `recipe_versions.authorId` is `ON DELETE set null`, so deleting this row
    // severs attribution on every version row that survived the delete above —
    // no row and no text is lost, only the record of who wrote it. Ordering
    // alone cannot contain that, which is why Step 0 halts entangled users
    // ahead of the whole function rather than guarding individual statements.
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

  return {
    status: "erased",
    counts,
    retainedRecipeCount,
    purgedAssetCount: purge.purged,
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
 * Best-effort and non-fatal: the data is already gone, and throwing here would
 * make a caller retry an erasure that fully succeeded. A missing salt skips the
 * record entirely rather than writing a guessable digest.
 */
async function writeDeletionRecord(
  userId: string,
  clerkId: string | null,
  options: ErasureOptions,
  result: Omit<ErasureResult, "status" | "entangledRecipeIds">,
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
