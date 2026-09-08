import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import {
  customDietaryRestrictionInputSchema,
  type CustomDietaryRestrictionInput,
} from '~/lib/dietary-assessment';
import { todayIso } from '~/lib/nutrition-targets';
import { db } from '~/server/db';
import {
  customDietaryRestrictions,
  customDietaryRestrictionTerms,
  dietaryAssessments,
  groupMembers,
  memberDietaryProfiles,
  nutritionTargets,
  type User,
} from '~/server/db/schema';
import { DomainError } from '~/server/errors';
import { type MemberProfileInput, type NutritionTargetInput } from './validation';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve the group a profile should be scoped to. A profile may only be
 * attached to a group the owner actually belongs to. Anything else, including
 * an omitted group, resolves to `null` for a personal, unscoped profile.
 */
async function resolveGroupId(
  tx: Tx,
  groupId: string | undefined,
  user: User,
): Promise<string | null> {
  if (!groupId) return null;
  const membership = await tx.query.groupMembers.findFirst({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)),
    columns: { id: true },
  });
  if (!membership) throw new Error('FORBIDDEN');
  return groupId;
}

function profileFields(input: MemberProfileInput, groupId: string | null) {
  return {
    name: input.name,
    allergens: input.allergens.length > 0 ? input.allergens : null,
    diets: input.diets.length > 0 ? input.diets : null,
    groupId,
  };
}

/** Load a profile the user owns, or throw NOT_FOUND. */
async function requireOwnedProfile(tx: Tx, id: string, user: User) {
  const profile = await tx.query.memberDietaryProfiles.findFirst({
    where: and(eq(memberDietaryProfiles.id, id), eq(memberDietaryProfiles.userId, user.id)),
    columns: { id: true },
  });
  if (!profile) throw new Error('NOT_FOUND');
  return profile;
}

async function requireOwnedCustomRestriction(tx: Tx, id: string, user: User) {
  const restriction = await tx.query.customDietaryRestrictions.findFirst({
    where: eq(customDietaryRestrictions.id, id),
    columns: {
      id: true,
      profileId: true,
      name: true,
      severity: true,
    },
    with: {
      profile: { columns: { userId: true } },
      terms: {
        columns: { term: true, source: true, approved: true },
      },
    },
  });
  if (!restriction || restriction.profile.userId !== user.id) {
    throw new DomainError('NOT_FOUND');
  }
  return restriction;
}

async function insertCustomRestrictionTerms(
  tx: Tx,
  restrictionId: string,
  terms: CustomDietaryRestrictionInput['terms'],
) {
  await tx.insert(customDietaryRestrictionTerms).values(
    terms.map((term) => ({
      restrictionId,
      term: term.term,
      source: term.source,
      approved: term.approved,
    })),
  );
}

/**
 * Create a profile-owned restriction. Exact/free-form terms remain explicitly
 * user-entered (`exact`, approved); suggested aliases retain their separate
 * source and approval fields.
 */
export async function createCustomDietaryRestriction(
  profileId: string,
  input: CustomDietaryRestrictionInput,
  user: User,
) {
  const value = customDietaryRestrictionInputSchema.parse(input);
  return db.transaction(async (tx) => {
    await requireOwnedProfile(tx, profileId, user);
    const [row] = await tx
      .insert(customDietaryRestrictions)
      .values({
        profileId,
        name: value.name,
        severity: value.severity,
      })
      .returning({ id: customDietaryRestrictions.id });
    if (!row) throw new DomainError('CONFLICT');
    await insertCustomRestrictionTerms(tx, row.id, value.terms);
    return row;
  });
}

/**
 * Replace a restriction and its term set atomically. Active dependent
 * assessments are invalidated because safe-for recipe SQL cannot perform the
 * in-memory term-fingerprint comparison used by full assessment reads.
 */
export async function updateCustomDietaryRestriction(
  id: string,
  input: CustomDietaryRestrictionInput,
  user: User,
) {
  const value = customDietaryRestrictionInputSchema.parse(input);
  return db.transaction(async (tx) => {
    await requireOwnedCustomRestriction(tx, id, user);
    const now = new Date();
    await tx
      .update(customDietaryRestrictions)
      .set({ name: value.name, severity: value.severity, updatedAt: now })
      .where(eq(customDietaryRestrictions.id, id));
    await tx
      .delete(customDietaryRestrictionTerms)
      .where(eq(customDietaryRestrictionTerms.restrictionId, id));
    await insertCustomRestrictionTerms(tx, id, value.terms);
    await tx
      .update(dietaryAssessments)
      .set({ invalidatedAt: now, updatedAt: now })
      .where(
        and(
          eq(dietaryAssessments.customRestrictionId, id),
          isNull(dietaryAssessments.invalidatedAt),
        ),
      );
    return { id };
  });
}

/** Hard-delete an owned restriction; its terms and dependent rows cascade. */
export async function deleteCustomDietaryRestriction(id: string, user: User) {
  return db.transaction(async (tx) => {
    await requireOwnedCustomRestriction(tx, id, user);
    await tx.delete(customDietaryRestrictions).where(eq(customDietaryRestrictions.id, id));
    return { id };
  });
}

/**
 * Copy a restriction without collapsing suggested aliases into exact terms.
 * Both source and target are independently owner-checked.
 */
export async function copyCustomDietaryRestriction(
  id: string,
  targetProfileId: string,
  user: User,
) {
  return db.transaction(async (tx) => {
    const source = await requireOwnedCustomRestriction(tx, id, user);
    await requireOwnedProfile(tx, targetProfileId, user);
    const value = customDietaryRestrictionInputSchema.parse({
      name: source.name,
      severity: source.severity,
      terms: source.terms,
    });
    const [row] = await tx
      .insert(customDietaryRestrictions)
      .values({
        profileId: targetProfileId,
        name: value.name,
        severity: value.severity,
      })
      .returning({ id: customDietaryRestrictions.id });
    if (!row) throw new DomainError('CONFLICT');
    await insertCustomRestrictionTerms(tx, row.id, value.terms);
    return row;
  });
}

export async function createMemberProfile(input: MemberProfileInput, user: User) {
  return db.transaction(async (tx) => {
    const groupId = await resolveGroupId(tx, input.groupId, user);
    const [row] = await tx
      .insert(memberDietaryProfiles)
      .values({
        ...profileFields(input, groupId),
        userId: user.id,
      })
      .returning({ id: memberDietaryProfiles.id });
    if (!row) throw new Error('CONFLICT');
    // A calorie goal supplied at creation is a target that starts today, not a
    // loose column value: it is recorded as one so it has a history from the
    // first day rather than from the first time it is edited.
    if (input.calorieGoal != null) {
      await tx.insert(nutritionTargets).values({
        profileId: row.id,
        effectiveFrom: todayIso(),
        targets: { calories: input.calorieGoal },
      });
    }
    return row;
  });
}

/** Update a profile's name, restrictions and group scope. */
export async function updateMemberProfile(id: string, input: MemberProfileInput, user: User) {
  return db.transaction(async (tx) => {
    await requireOwnedProfile(tx, id, user);
    const groupId = await resolveGroupId(tx, input.groupId, user);
    const [row] = await tx
      .update(memberDietaryProfiles)
      .set(profileFields(input, groupId))
      .where(and(eq(memberDietaryProfiles.id, id), eq(memberDietaryProfiles.userId, user.id)))
      .returning({ id: memberDietaryProfiles.id });
    if (!row) throw new Error('NOT_FOUND');
    return row;
  });
}

export async function deleteMemberProfile(id: string, user: User) {
  const [row] = await db
    .delete(memberDietaryProfiles)
    .where(and(eq(memberDietaryProfiles.id, id), eq(memberDietaryProfiles.userId, user.id)))
    .returning({ id: memberDietaryProfiles.id });
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

/**
 * Record the targets a member is aiming for from `effectiveFrom` onward
 * (#1046).
 *
 * Upserts on `(profileId, effectiveFrom)`: correcting a target you set today
 * edits that day's row instead of stacking a second row on the same date, so
 * the history stays a sequence of *changes* rather than a log of keystrokes.
 * Earlier rows are untouched — that is the whole point of the table, and why a
 * past week keeps the score it was cooked under.
 *
 * Clearing every field deletes the row: "no targets from this date" is a real
 * statement (a member coming off a cut), and it is not the same as a row of
 * zeroes, which would score every day as an infinite overshoot.
 */
export async function setNutritionTarget(input: NutritionTargetInput, user: User) {
  return db.transaction(async (tx) => {
    await requireOwnedProfile(tx, input.profileId, user);

    const hasAny = Object.keys(input.targets).length > 0;
    if (!hasAny) {
      await tx
        .delete(nutritionTargets)
        .where(
          and(
            eq(nutritionTargets.profileId, input.profileId),
            eq(nutritionTargets.effectiveFrom, input.effectiveFrom),
          ),
        );
      return { id: input.profileId };
    }

    const [row] = await tx
      .insert(nutritionTargets)
      .values({
        profileId: input.profileId,
        effectiveFrom: input.effectiveFrom,
        targets: input.targets,
      })
      .onConflictDoUpdate({
        target: [nutritionTargets.profileId, nutritionTargets.effectiveFrom],
        set: { targets: input.targets, updatedAt: new Date() },
      })
      .returning({ id: nutritionTargets.id });
    if (!row) throw new Error('CONFLICT');

    return row;
  });
}

/**
 * Remove one dated target from a member's history. Deleting the newest row
 * restores whatever was in force before it, which is what "undo this change"
 * means for a versioned fact.
 */
export async function deleteNutritionTarget(id: string, user: User) {
  return db.transaction(async (tx) => {
    const target = await tx.query.nutritionTargets.findFirst({
      where: eq(nutritionTargets.id, id),
      columns: { id: true, profileId: true },
    });
    if (!target) throw new Error('NOT_FOUND');
    await requireOwnedProfile(tx, target.profileId, user);

    await tx.delete(nutritionTargets).where(eq(nutritionTargets.id, id));
    return { id };
  });
}
