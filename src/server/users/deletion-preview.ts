import 'server-only';

import { and, count, eq, inArray, ne } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import {
  billingCustomers,
  collections,
  cookLogEntries,
  groupMembers,
  groups,
  recipeCreators,
  recipes,
  reviews,
  subscriptions,
} from '~/server/db/schema';
import { findEntanglement } from './erasure-holds';

/**
 * What a user is about to lose (issue #678, PR B).
 *
 * Erasure is irreversible, so the confirmation screen has to describe *this*
 * account rather than the feature in general. "Delete 214 recipes" is a
 * decision; "delete your data" is a shrug. Every number here is one the user
 * can check against their own cookbook before they type the confirmation.
 *
 * Read-only and side-effect free. It is deliberately a separate module from
 * {@link import("./erasure").eraseUserAccount} so the notice can be rendered,
 * translated and tested without any risk of touching the erasure path.
 */

export type SoleOwnerGroup = {
  id: string;
  name: string;
  slug: string;
  otherMemberCount: number;
};

export type DeletionPreview = {
  /** Recipes owned by this user. All of these are deleted. */
  ownedRecipeCount: number;
  /**
   * Recipes owned by *someone else* on which this user is an accepted creator.
   * These survive; only the creator link and its namespaced URL go away.
   * Pending invitations are excluded — a pending invite grants nothing, so it
   * is not a recipe the user has any claim on.
   */
  coCreatedRecipeCount: number;
  /** Pending creator invitations, which are simply withdrawn. */
  pendingInviteCount: number;
  /**
   * How many recipes make this account's erasure *undeliverable today* (#787).
   *
   * Not a count of things being deleted — the opposite. If this is above zero
   * the erasure is **held**: nothing is deleted, the account stays wholly
   * intact, and the request is recorded for replay (#694).
   *
   * Deliberately derived from {@link findEntanglement}, the same function the
   * erasure path calls to decide whether to halt, rather than from a query of
   * its own. `coCreatedRecipeCount` above used to be the closest thing the
   * notice had to this, and it is **not** the same predicate: it covers only
   * recipes owned by someone else. A user who merely *owns* a recipe carrying
   * accepted co-creators is halted by the erasure and was invisible here, so
   * the notice promised them an immediate, permanent, irreversible deletion
   * and then held it. One predicate, one caller, no drift.
   */
  heldRecipeCount: number;
  cookLogEntryCount: number;
  reviewCount: number;
  collectionCount: number;
  /**
   * Groups where this user is the only owner and other members remain. Deleting
   * the account cascades their membership away and leaves the group ownerless,
   * so the notice must name them and ask the user to hand them over first.
   */
  soleOwnerGroups: SoleOwnerGroup[];
  /** Whether a live subscription will need cancelling. */
  hasActiveSubscription: boolean;
};

const EMPTY: DeletionPreview = {
  ownedRecipeCount: 0,
  coCreatedRecipeCount: 0,
  pendingInviteCount: 0,
  heldRecipeCount: 0,
  cookLogEntryCount: 0,
  reviewCount: 0,
  collectionCount: 0,
  soleOwnerGroups: [],
  hasActiveSubscription: false,
};

const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

async function countRows(run: () => Promise<{ value: number }[]>): Promise<number> {
  const [row] = await run();
  return row?.value ?? 0;
}

/**
 * Groups this user solely owns that would be left ownerless.
 *
 * A group with no other members is not a problem — it disappears with its only
 * member and nobody is stranded. The harm case is a group other people still
 * use, so that is the only one worth interrupting the user about.
 */
async function findSoleOwnerGroups(userId: string): Promise<SoleOwnerGroup[]> {
  const owned = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.role, 'owner')));

  const groupIds = owned.map((row) => row.groupId);
  if (groupIds.length === 0) return [];

  const otherOwners = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(
      and(
        inArray(groupMembers.groupId, groupIds),
        eq(groupMembers.role, 'owner'),
        ne(groupMembers.userId, userId),
      ),
    );

  const sharedOwnership = new Set(otherOwners.map((row) => row.groupId));
  const soleOwned = groupIds.filter((id) => !sharedOwnership.has(id));
  if (soleOwned.length === 0) return [];

  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      slug: groups.slug,
      otherMemberCount: count(groupMembers.id),
    })
    .from(groups)
    .leftJoin(
      groupMembers,
      and(eq(groupMembers.groupId, groups.id), ne(groupMembers.userId, userId)),
    )
    .where(inArray(groups.id, soleOwned))
    .groupBy(groups.id, groups.name, groups.slug);

  return rows
    .filter((row) => row.otherMemberCount > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      otherMemberCount: Number(row.otherMemberCount),
    }));
}

export async function getDeletionPreview(userId: string): Promise<DeletionPreview> {
  if (!isDbConfigured()) return EMPTY;

  const [
    ownedRecipeCount,
    coCreatedRecipeCount,
    pendingInviteCount,
    entanglement,
    cookLogEntryCount,
    reviewCount,
    collectionCount,
    soleOwnerGroups,
    liveSubscriptions,
  ] = await Promise.all([
    countRows(() =>
      db.select({ value: count() }).from(recipes).where(eq(recipes.authorId, userId)),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(recipeCreators)
        .innerJoin(recipes, eq(recipes.id, recipeCreators.recipeId))
        .where(
          and(
            eq(recipeCreators.userId, userId),
            eq(recipeCreators.status, 'accepted'),
            // Belt and braces: the owner is never a row in this table, but a
            // future backfill that duplicated `authorId` in must not inflate
            // the "these will survive" number with recipes we are deleting.
            ne(recipes.authorId, userId),
          ),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(recipeCreators)
        .where(and(eq(recipeCreators.userId, userId), eq(recipeCreators.status, 'pending'))),
    ),
    // The erasure path's own halt predicate (#787). Calling it here rather than
    // re-deriving it is the point: whatever the erasure would hold on is
    // exactly what the notice discloses, including the owner-side direction
    // that `coCreatedRecipeCount` above does not see.
    findEntanglement(userId),
    countRows(() =>
      db.select({ value: count() }).from(cookLogEntries).where(eq(cookLogEntries.userId, userId)),
    ),
    countRows(() => db.select({ value: count() }).from(reviews).where(eq(reviews.userId, userId))),
    countRows(() =>
      db.select({ value: count() }).from(collections).where(eq(collections.userId, userId)),
    ),
    findSoleOwnerGroups(userId),
    countRows(() =>
      db
        .select({ value: count() })
        .from(subscriptions)
        .innerJoin(billingCustomers, eq(billingCustomers.id, subscriptions.customerId))
        .where(
          and(
            eq(billingCustomers.userId, userId),
            inArray(subscriptions.status, [...LIVE_SUBSCRIPTION_STATUSES]),
          ),
        ),
    ),
  ]);

  return {
    ownedRecipeCount,
    coCreatedRecipeCount,
    pendingInviteCount,
    heldRecipeCount: entanglement.recipeIds.length,
    cookLogEntryCount,
    reviewCount,
    collectionCount,
    soleOwnerGroups,
    hasActiveSubscription: liveSubscriptions > 0,
  };
}

/** Total rows the user can see disappearing, for the headline sentence. */
export function previewTotal(preview: DeletionPreview): number {
  return (
    preview.ownedRecipeCount +
    preview.cookLogEntryCount +
    preview.reviewCount +
    preview.collectionCount
  );
}
