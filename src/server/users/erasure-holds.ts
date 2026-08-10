import "server-only";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import { log } from "~/lib/log";
import { db } from "~/server/db";
import {
  erasureHolds,
  recipeCreators,
  recipes,
  type DeletionTrigger,
  type ErasureHoldReason,
} from "~/server/db/schema";

/**
 * Containment for the co-creator erasure gap (issue #694).
 *
 * ADR 0003 recorded "cross-owner editing does not exist" as the precondition
 * that made the co-creator exception safe. #685 crossed it. The consequence is
 * not merely that erasure under-erases — it is that erasure **destroys the
 * evidence needed to ever fix the under-erasure**, in the same transaction:
 *
 * 1. The departing user's prose survives in someone else's `recipes.story`,
 *    `notes` and step text, and inside `recipe_versions.snapshot` rows written
 *    by other users after their edit. No author-scoped delete reaches it.
 * 2. Their own `recipe_versions` rows are the only record of which words were
 *    theirs, and erasure deletes them. `recipe_versions.authorId` is
 *    `ON DELETE set null`, so the `users` delete severs that attribution even
 *    if the explicit delete were removed. Both paths are irreversible.
 *
 * Which remedy to build — narrow the exception, defer co-creator editing,
 * version-diff reversion, or accept and document — is a product decision, and
 * it is open. Containment is not that decision and does not depend on it: it
 * only changes *when* erasure runs, for a narrow set of accounts. Nothing that
 * would otherwise be kept gets deleted; deletions that would destroy
 * irreplaceable evidence are deferred until a remedy exists.
 *
 * The rule, chosen by the product owner: an erasure that touches a co-created
 * recipe is **held**, not executed. A held request is recorded durably so it is
 * replayable and countable — silently doing neither is itself a compliance
 * failure.
 */

export type Entanglement = {
  reason: ErasureHoldReason;
  /** Recipes the erasure cannot cleanly separate. Empty means not entangled. */
  recipeIds: string[];
};

/**
 * Is this user entangled in co-created content, in either direction?
 *
 * Both directions matter and neither is symmetrical with the other:
 *
 * - **They co-create someone else's recipe.** Since #685 they could have edited
 *   its body, so their prose may sit in a recipe that survives the erasure.
 * - **They own a recipe carrying other accepted creators.** That recipe is
 *   deleted by erasure, and with it (by cascade) every co-creator's version
 *   rows on it — including the ones that would evidence what the *departing*
 *   owner wrote versus what the co-creators wrote.
 *
 * `pending` is excluded, consistently with the shipped survival rule: a pending
 * invitation grants no access and no slug, so its holder cannot have edited
 * anything and creates no entanglement.
 *
 * Read on the primary connection outside any transaction, before the erasure
 * begins. A false negative here silently destroys evidence, so the query is
 * deliberately broader than "recipes we know they edited": narrowing it needs
 * exactly the rows the erasure is about to delete (#728).
 */
export async function findEntanglement(userId: string): Promise<Entanglement> {
  const asCoCreator = await db
    .select({ recipeId: recipeCreators.recipeId })
    .from(recipeCreators)
    .innerJoin(recipes, eq(recipes.id, recipeCreators.recipeId))
    .where(
      and(
        eq(recipeCreators.userId, userId),
        eq(recipeCreators.status, "accepted"),
        ne(recipes.authorId, userId),
      ),
    );

  const asOwner = await db
    .select({ recipeId: recipeCreators.recipeId })
    .from(recipeCreators)
    .innerJoin(recipes, eq(recipes.id, recipeCreators.recipeId))
    .where(
      and(
        eq(recipes.authorId, userId),
        eq(recipeCreators.status, "accepted"),
        ne(recipeCreators.userId, userId),
      ),
    );

  const recipeIds = [
    ...new Set([...asCoCreator, ...asOwner].map((row) => row.recipeId)),
  ].sort();

  return { reason: "co_created_entanglement", recipeIds };
}

/**
 * Record a held erasure request so it survives the process that received it.
 *
 * Upserted on `userId`: Clerk retries `user.deleted`, and every retry is the
 * same standing request. Accumulating a row per delivery would inflate the
 * backlog an operator is meant to act on, so a retry bumps the counter instead.
 *
 * Also logged at `warn`. The table is the durable record; the log line is what
 * reaches an operator on the day it happens rather than the day someone thinks
 * to query.
 */
export async function recordErasureHold(
  userId: string,
  entanglement: Entanglement,
  options: { trigger: DeletionTrigger; noticeVersion?: string },
): Promise<void> {
  const now = new Date();
  await db
    .insert(erasureHolds)
    .values({
      userId,
      trigger: options.trigger,
      reason: entanglement.reason,
      entangledRecipeIds: entanglement.recipeIds,
      firstRequestedAt: now,
      lastRequestedAt: now,
      noticeVersion: options.noticeVersion ?? null,
    })
    .onConflictDoUpdate({
      target: erasureHolds.userId,
      set: {
        trigger: options.trigger,
        reason: entanglement.reason,
        entangledRecipeIds: entanglement.recipeIds,
        lastRequestedAt: now,
        requestCount: sql`${erasureHolds.requestCount} + 1`,
        noticeVersion: options.noticeVersion ?? null,
        // A repeat request re-opens a hold that was released without the
        // erasure actually running.
        releasedAt: null,
      },
    });

  log.warn("erasure.held", {
    reason: entanglement.reason,
    trigger: options.trigger,
    entangledRecipeCount: entanglement.recipeIds.length,
  });
}

export type ErasureBacklog = {
  open: number;
  oldestRequestedAt: string | null;
  totalEntangledRecipes: number;
};

/**
 * The operator-facing backlog. "We are holding N erasure requests we cannot yet
 * fulfil, the oldest since <date>" is a defensible position; neither completing
 * nor erroring, with nothing to count, is not.
 *
 * Counts only — no ids, no identifiers — so the answer can be polled and
 * alerted on without re-creating the profile the requests are asking to remove.
 */
export async function getErasureBacklog(): Promise<ErasureBacklog> {
  const rows = await db
    .select({
      firstRequestedAt: erasureHolds.firstRequestedAt,
      entangledRecipeIds: erasureHolds.entangledRecipeIds,
    })
    .from(erasureHolds)
    .where(isNull(erasureHolds.releasedAt))
    .orderBy(asc(erasureHolds.firstRequestedAt));

  return {
    open: rows.length,
    oldestRequestedAt: rows[0]?.firstRequestedAt.toISOString() ?? null,
    totalEntangledRecipes: rows.reduce(
      (total, row) => total + (row.entangledRecipeIds?.length ?? 0),
      0,
    ),
  };
}
