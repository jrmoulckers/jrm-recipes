import 'server-only';

import { and, desc, eq, lte } from 'drizzle-orm';

import { selectEffectiveTarget, todayIso } from '~/lib/nutrition-targets';
import { db } from '~/server/db';
import {
  groupMembers,
  memberDietaryProfiles,
  nutritionTargets,
  type User,
} from '~/server/db/schema';
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

/**
 * Mirror the calorie target in force today onto the legacy
 * `memberDietaryProfiles.calorieGoal` column (#1046).
 *
 * The column is the *old* shape of this fact and is being removed in the
 * contract migration. Until that ships, code deployed before the targets table
 * still reads it, so every write that can change today's target dual-writes it
 * here rather than leaving the two to drift — which is exactly the failure mode
 * folding the goal into the targets table was meant to end.
 */
async function syncProfileCalorieGoal(tx: Tx, profileId: string) {
  const today = todayIso();
  const rows = await tx
    .select({
      effectiveFrom: nutritionTargets.effectiveFrom,
      targets: nutritionTargets.targets,
    })
    .from(nutritionTargets)
    .where(
      and(eq(nutritionTargets.profileId, profileId), lte(nutritionTargets.effectiveFrom, today)),
    )
    .orderBy(desc(nutritionTargets.effectiveFrom))
    .limit(1);

  const current = selectEffectiveTarget(rows, today);
  const calories = current?.targets?.calories;
  await tx
    .update(memberDietaryProfiles)
    .set({ calorieGoal: typeof calories === 'number' ? Math.round(calories) : null })
    .where(eq(memberDietaryProfiles.id, profileId));
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

export async function createMemberProfile(input: MemberProfileInput, user: User) {
  return db.transaction(async (tx) => {
    const groupId = await resolveGroupId(tx, input.groupId, user);
    const [row] = await tx
      .insert(memberDietaryProfiles)
      .values({
        ...profileFields(input, groupId),
        calorieGoal: input.calorieGoal ?? null,
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

/**
 * Update a profile's name, restrictions and group scope.
 *
 * `calorieGoal` is deliberately **not** written here (#1046). It is a mirror of
 * the target in force today, owned by {@link setNutritionTarget}; writing it
 * from the profile form as well would give one fact two editors and let them
 * disagree.
 */
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
      await syncProfileCalorieGoal(tx, input.profileId);
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

    await syncProfileCalorieGoal(tx, input.profileId);
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
    await syncProfileCalorieGoal(tx, target.profileId);
    return { id };
  });
}
