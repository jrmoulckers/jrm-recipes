import { index, integer, jsonb, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { fk, pk } from './_shared';
import { users } from './users';

/** How an erasure was initiated. */
export const deletionTrigger = pgEnum('deletion_trigger', [
  'clerk_webhook',
  'in_app',
  'admin',
  'dsr_request',
]);

/**
 * Proof that an account erasure happened, kept *after* the `users` row is gone
 * (issue #678).
 *
 * Two jobs, and the tension between them is what shapes every column here:
 *
 * 1. **Accountability.** GDPR Art. 5(2) expects a controller to be able to
 *    evidence that it honoured an erasure request, and when.
 * 2. **Re-application after a restore.** A backup restored from before the
 *    deletion resurrects the user. `docs/db-backup-and-recovery.md` makes
 *    re-applying erasure a mandatory gate before a restored instance is
 *    promoted, and that step needs to know *who* to re-erase — after the only
 *    row that identified them has been destroyed.
 *
 * The tension: a record rich enough to be useful re-creates the profile the
 * erasure just removed. So identifiers are stored **only as salted hashes**.
 * `hashDeletionSubject` can re-derive a hash from a restored row's id, which is
 * all re-application needs, but the hash is not reversible into an identifier
 * and cannot be correlated across deployments without the salt.
 *
 * What must NEVER be stored here: email, name, handle, slug, avatar URL, raw
 * `clerkId` or `users.id`, recipe titles, or any other free text. Counts and
 * hashes only. A tombstone that leaks is worse than no tombstone, because it
 * outlives the data it describes and nothing else references it.
 */
export const deletionRecords = pgTable(
  'deletion_records',
  {
    id: pk(),
    /**
     * Salted SHA-256 of the former `users.id`. The lookup key for restore
     * re-application: hash a restored row's id and check for a match.
     */
    subjectHash: varchar({ length: 64 }).notNull().unique(),
    /**
     * Salted SHA-256 of the former `clerkId`, when there was one. Lets a repeat
     * `user.deleted` webhook be recognised as already-handled after the local row
     * is gone, which is what makes the erasure path idempotent.
     */
    clerkIdHash: varchar({ length: 64 }),
    trigger: deletionTrigger().notNull(),
    requestedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    /** Null until the erasure finishes; a non-null value is the completion proof. */
    completedAt: timestamp({ withTimezone: true }),
    /**
     * Rows removed per table, e.g. `{"recipes": 12, "comments": 40}`. Counts
     * only — never ids, never content. This is the verification evidence that the
     * erasure actually reached each store.
     */
    deletedCounts: jsonb().$type<Record<string, number>>(),
    /**
     * Recipes that survived because the departing user was a non-owner creator.
     *
     * Accurate as retention evidence. But this column is also the only
     * retrospective estimate of the #694 remediation population, and for that
     * purpose it is an **upper bound** — it counts recipes the user could have
     * edited, not ones they did (#728).
     */
    retainedRecipeCount: integer().notNull().default(0),
    /** Cloudinary assets successfully destroyed before the DB delete. */
    purgedAssetCount: integer().notNull().default(0),
    /**
     * Per-processor propagation state, e.g.
     * `{"cloudinary": {"status": "ok", "at": "..."}}`. Evidence for the processor
     * obligations in #678 §6, and the queue for anything that needs retrying.
     */
    processorStatus: jsonb().$type<Record<string, unknown>>(),
    /**
     * The date the last backup containing this user expires. Until then the data
     * is "beyond use" rather than gone, and this is the horizon disclosed to the
     * user.
     */
    backupHorizonAt: timestamp({ withTimezone: true }),
    /**
     * Identifier of the confirmation copy the user was shown. Evidence of what
     * they were actually told before confirming, which is the Art. 12 notice
     * record. Null for deletions that did not originate in our UI.
     */
    noticeVersion: varchar({ length: 40 }),
  },
  (t) => [
    // `hasBeenErased` reads this to recognise a repeat `user.deleted` webhook
    // after the local row is gone, which is what makes erasure idempotent
    // against Clerk's retries.
    index('deletion_records_clerk_id_hash_idx').on(t.clerkIdHash),
  ],
);

export type DeletionRecord = typeof deletionRecords.$inferSelect;
export type NewDeletionRecord = typeof deletionRecords.$inferInsert;
export type DeletionTrigger = (typeof deletionTrigger.enumValues)[number];

/** Why an erasure request could not be executed when it arrived. */
export const erasureHoldReason = pgEnum('erasure_hold_reason', ['co_created_entanglement']);

/**
 * An erasure request that arrived, was accepted, and has **not** been executed
 * because executing it would destroy the only evidence needed to remedy it
 * (issue #694).
 *
 * The hazard is documented in `eraseUserAccount`: since #685 an accepted
 * co-creator can edit a recipe they do not own, so a departing user's prose can
 * survive inside someone else's recipe, and the departing user's own
 * `recipe_versions` rows are the sole record of which words were theirs.
 * Erasure deletes those rows — and `recipe_versions.authorId` is `set null`, so
 * deleting the `users` row severs the attribution even if that delete were
 * removed. Both paths destroy the diff basis irreversibly, so the erasure is
 * halted before the first destructive step for entangled accounts.
 *
 * This table is what makes that halt defensible rather than a dropped request.
 * A webhook that neither completes nor records anything is itself a compliance
 * failure: the request must stay durable, replayable once a remedy lands, and
 * countable so an operator can answer "how many erasures are we holding?".
 *
 * **Not a tombstone.** Unlike `deletion_records`, the subject still exists, so
 * a hash would be pointless — replay needs the real id. `userId` therefore
 * cascades: once the erasure finally runs, the hold disappears with the account
 * and leaves no residue about a user who has been erased.
 *
 * One row per subject. Clerk retries `user.deleted`, and a retry must update
 * the existing hold rather than accumulate duplicates that would inflate the
 * backlog count.
 */
export const erasureHolds = pgTable(
  'erasure_holds',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    trigger: deletionTrigger().notNull(),
    reason: erasureHoldReason().notNull(),
    /**
     * Recipes whose text the erasure cannot separate: ones the user co-creates
     * but does not own, and ones they own that carry other accepted creators.
     * Ids, not content — this is the replay worklist for the eventual remedy.
     */
    entangledRecipeIds: jsonb().$type<string[]>().notNull(),
    /** How many times the request has been received. Retries land here. */
    requestCount: integer().notNull().default(1),
    firstRequestedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastRequestedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    /** Which confirmation copy the user was shown, when ours showed it. */
    noticeVersion: varchar({ length: 40 }),
    /**
     * Set when the hold is lifted — by a remedy, or by the entanglement going
     * away. Open holds are the backlog; released ones are the audit trail of
     * how long each request waited.
     */
    releasedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // The backlog query is "open holds, oldest first", so it filters on
    // `releasedAt IS NULL` and orders by first request.
    index('erasure_holds_released_at_idx').on(t.releasedAt, t.firstRequestedAt),
  ],
);

export type ErasureHold = typeof erasureHolds.$inferSelect;
export type NewErasureHold = typeof erasureHolds.$inferInsert;
export type ErasureHoldReason = (typeof erasureHoldReason.enumValues)[number];
