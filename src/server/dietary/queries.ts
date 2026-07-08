import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { memberDietaryProfiles } from "~/server/db/schema";

/**
 * All dietary profiles a user manages, oldest first so the list is stable as
 * new members are added. Owner-scoped: a cook only ever sees the profiles they
 * created.
 */
export async function listMemberProfiles(userId: string) {
  return db.query.memberDietaryProfiles.findMany({
    where: eq(memberDietaryProfiles.userId, userId),
    orderBy: [
      asc(memberDietaryProfiles.createdAt),
      asc(memberDietaryProfiles.id),
    ],
  });
}
