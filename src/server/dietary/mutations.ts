import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  groupMembers,
  memberDietaryProfiles,
  type User,
} from "~/server/db/schema";
import { type MemberProfileInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve the group a profile should be scoped to. A profile may only be
 * attached to a group the owner actually belongs to; anything else (including
 * an omitted group) resolves to `null` — a personal, unscoped profile.
 */
async function resolveGroupId(
  tx: Tx,
  groupId: string | undefined,
  user: User,
): Promise<string | null> {
  if (!groupId) return null;
  const membership = await tx.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, user.id),
    ),
    columns: { id: true },
  });
  if (!membership) throw new Error("FORBIDDEN");
  return groupId;
}

function profileFields(input: MemberProfileInput, groupId: string | null) {
  return {
    name: input.name,
    allergens: input.allergens.length > 0 ? input.allergens : null,
    diets: input.diets.length > 0 ? input.diets : null,
    calorieGoal: input.calorieGoal ?? null,
    groupId,
  };
}

/** Load a profile the user owns, or throw NOT_FOUND. */
async function requireOwnedProfile(tx: Tx, id: string, user: User) {
  const profile = await tx.query.memberDietaryProfiles.findFirst({
    where: and(
      eq(memberDietaryProfiles.id, id),
      eq(memberDietaryProfiles.userId, user.id),
    ),
    columns: { id: true },
  });
  if (!profile) throw new Error("NOT_FOUND");
  return profile;
}

export async function createMemberProfile(
  input: MemberProfileInput,
  user: User,
) {
  return db.transaction(async (tx) => {
    const groupId = await resolveGroupId(tx, input.groupId, user);
    const [row] = await tx
      .insert(memberDietaryProfiles)
      .values({ ...profileFields(input, groupId), userId: user.id })
      .returning({ id: memberDietaryProfiles.id });
    if (!row) throw new Error("CONFLICT");
    return row;
  });
}

export async function updateMemberProfile(
  id: string,
  input: MemberProfileInput,
  user: User,
) {
  return db.transaction(async (tx) => {
    await requireOwnedProfile(tx, id, user);
    const groupId = await resolveGroupId(tx, input.groupId, user);
    const [row] = await tx
      .update(memberDietaryProfiles)
      .set(profileFields(input, groupId))
      .where(
        and(
          eq(memberDietaryProfiles.id, id),
          eq(memberDietaryProfiles.userId, user.id),
        ),
      )
      .returning({ id: memberDietaryProfiles.id });
    if (!row) throw new Error("NOT_FOUND");
    return row;
  });
}

export async function deleteMemberProfile(id: string, user: User) {
  const [row] = await db
    .delete(memberDietaryProfiles)
    .where(
      and(
        eq(memberDietaryProfiles.id, id),
        eq(memberDietaryProfiles.userId, user.id),
      ),
    )
    .returning({ id: memberDietaryProfiles.id });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
