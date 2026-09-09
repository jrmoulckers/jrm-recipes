import 'server-only';

import { and, count, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import {
  billingCustomers,
  collections,
  cookLogEntries,
  customDietaryRestrictions,
  dietaryAssessments,
  dietaryIngredientCorrections,
  groupMembers,
  groups,
  memberDietaryProfiles,
  recipeCreators,
  recipeIngredients,
  recipeVersions,
  reviews,
  subscriptions,
} from '~/server/db/schema';
import { planRetainedMediaTransfers } from '~/server/media/custody';
import { planAccountRecipeRetention } from './recipe-retention';

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
  /** Recipes owned by this user before deletion. */
  ownedRecipeCount: number;
  /** Solely owned recipes that are deleted with the account. */
  deletedOwnedRecipeCount: number;
  /** Owned recipes retained without an owner because accepted creators remain. */
  unclaimedRecipeCount: number;
  /**
   * Recipes owned by *someone else* on which this user is an accepted creator.
   * These survive; only the creator link and its namespaced URL go away.
   * Pending invitations are excluded — a pending invite grants nothing, so it
   * is not a recipe the user has any claim on.
   */
  coCreatedRecipeCount: number;
  /** Ownerless non-public recipes deleted because no other creator remains. */
  deletedSharedRecipeCount: number;
  /** Pending creator invitations, which are simply withdrawn. */
  pendingInviteCount: number;
  /** User-authored snapshots retained without an account reference. */
  retainedVersionCount: number;
  /** User-owned media assets retained under another lifecycle custodian. */
  retainedMediaCount: number;
  cookLogEntryCount: number;
  reviewCount: number;
  collectionCount: number;
  /** Creator-owned dietary profiles deleted with the account. */
  dietaryProfileCount: number;
  /** Custom restrictions cascading from the creator's profiles. */
  customDietaryRestrictionCount: number;
  /** Personal/profile assessments cascading with the account or its profiles. */
  personalDietaryAssessmentCount: number;
  /** Canonical built-in assessments retained with surviving shared recipes. */
  retainedDietaryAssessmentCount: number;
  /** Structured built-in corrections retained with surviving shared recipes. */
  retainedDietaryCorrectionCount: number;
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
  deletedOwnedRecipeCount: 0,
  unclaimedRecipeCount: 0,
  coCreatedRecipeCount: 0,
  deletedSharedRecipeCount: 0,
  pendingInviteCount: 0,
  retainedVersionCount: 0,
  retainedMediaCount: 0,
  cookLogEntryCount: 0,
  reviewCount: 0,
  collectionCount: 0,
  dietaryProfileCount: 0,
  customDietaryRestrictionCount: 0,
  personalDietaryAssessmentCount: 0,
  retainedDietaryAssessmentCount: 0,
  retainedDietaryCorrectionCount: 0,
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

  const retention = await planAccountRecipeRetention(userId);
  const mediaPlan = await planRetainedMediaTransfers(
    userId,
    retention.retainedRecipes,
    db,
    retention.ownedRecipeIds,
  );
  const retainedRecipeIds = retention.retainedRecipes.map(({ recipeId }) => recipeId);
  const [
    pendingInviteCount,
    retainedVersionCount,
    cookLogEntryCount,
    reviewCount,
    collectionCount,
    soleOwnerGroups,
    liveSubscriptions,
    dietaryProfileCount,
    customDietaryRestrictionCount,
    personalDietaryAssessmentCount,
    retainedDietaryAssessmentCount,
    retainedDietaryCorrectionCount,
  ] = await Promise.all([
    countRows(() =>
      db
        .select({ value: count() })
        .from(recipeCreators)
        .where(and(eq(recipeCreators.userId, userId), eq(recipeCreators.status, 'pending'))),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(recipeVersions)
        .where(
          retainedRecipeIds.length === 0
            ? eq(recipeVersions.authorId, '__none__')
            : and(
                eq(recipeVersions.authorId, userId),
                inArray(recipeVersions.recipeId, retainedRecipeIds),
              ),
        ),
    ),
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
    countRows(() =>
      db
        .select({ value: count() })
        .from(memberDietaryProfiles)
        .where(eq(memberDietaryProfiles.userId, userId)),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(customDietaryRestrictions)
        .innerJoin(
          memberDietaryProfiles,
          eq(memberDietaryProfiles.id, customDietaryRestrictions.profileId),
        )
        .where(eq(memberDietaryProfiles.userId, userId)),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(dietaryAssessments)
        .leftJoin(memberDietaryProfiles, eq(memberDietaryProfiles.id, dietaryAssessments.profileId))
        .where(
          or(eq(dietaryAssessments.ownerUserId, userId), eq(memberDietaryProfiles.userId, userId)),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(dietaryAssessments)
        .where(
          and(
            eq(dietaryAssessments.scope, 'canonical'),
            eq(dietaryAssessments.createdById, userId),
            isNull(dietaryAssessments.invalidatedAt),
            retainedRecipeIds.length === 0
              ? eq(dietaryAssessments.recipeId, '__none__')
              : inArray(dietaryAssessments.recipeId, retainedRecipeIds),
          ),
        ),
    ),
    countRows(() =>
      db
        .select({ value: count() })
        .from(dietaryIngredientCorrections)
        .innerJoin(
          recipeIngredients,
          eq(recipeIngredients.id, dietaryIngredientCorrections.ingredientId),
        )
        .where(
          and(
            eq(dietaryIngredientCorrections.actorId, userId),
            isNotNull(dietaryIngredientCorrections.ruleId),
            isNull(dietaryIngredientCorrections.customRestrictionId),
            isNull(dietaryIngredientCorrections.revokedAt),
            retainedRecipeIds.length === 0
              ? eq(recipeIngredients.recipeId, '__none__')
              : inArray(recipeIngredients.recipeId, retainedRecipeIds),
          ),
        ),
    ),
  ]);

  return {
    ownedRecipeCount: retention.ownedRecipeIds.length,
    deletedOwnedRecipeCount: retention.ownedToDeleteIds.length,
    unclaimedRecipeCount: retention.ownedToUnclaimIds.length,
    coCreatedRecipeCount: retention.retainedCoCreatedRecipeIds.length,
    deletedSharedRecipeCount: retention.ownerlessToDeleteIds.length,
    pendingInviteCount,
    retainedVersionCount,
    retainedMediaCount: mediaPlan.transfers.length,
    cookLogEntryCount,
    reviewCount,
    collectionCount,
    dietaryProfileCount,
    customDietaryRestrictionCount,
    personalDietaryAssessmentCount,
    retainedDietaryAssessmentCount,
    retainedDietaryCorrectionCount,
    soleOwnerGroups,
    hasActiveSubscription: liveSubscriptions > 0,
  };
}

/** Total rows the user can see disappearing, for the headline sentence. */
export function previewTotal(preview: DeletionPreview): number {
  return (
    preview.deletedOwnedRecipeCount +
    preview.deletedSharedRecipeCount +
    preview.cookLogEntryCount +
    preview.reviewCount +
    preview.collectionCount +
    preview.dietaryProfileCount +
    preview.customDietaryRestrictionCount +
    preview.personalDietaryAssessmentCount
  );
}
