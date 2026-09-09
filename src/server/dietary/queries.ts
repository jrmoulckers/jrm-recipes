import 'server-only';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '~/server/db';
import {
  customDietaryRestrictions,
  customDietaryRestrictionTerms,
  memberDietaryProfiles,
  type User,
} from '~/server/db/schema';
import { DomainError } from '~/server/errors';

/**
 * All dietary profiles a user manages, oldest first so the list is stable as
 * new members are added. Owner-scoped: a cook only ever sees the profiles they
 * created.
 */
export async function listMemberProfiles(userId: string) {
  return db.query.memberDietaryProfiles.findMany({
    where: eq(memberDietaryProfiles.userId, userId),
    orderBy: [asc(memberDietaryProfiles.createdAt), asc(memberDietaryProfiles.id)],
    with: {
      customRestrictions: {
        with: { terms: true },
        orderBy: (restriction, { asc }) => [asc(restriction.createdAt), asc(restriction.id)],
      },
    },
  });
}

/**
 * Load active custom restrictions, including exact terms and Family aliases,
 * for an explicitly requested set of profiles. The all-or-nothing ownership
 * check prevents a mixed list of owned and foreign ids from becoming an
 * existence oracle.
 */
export async function listCustomRestrictionsForProfiles(profileIds: readonly string[], user: User) {
  const ids = [...new Set(profileIds)];
  if (ids.length === 0) return [];

  const ownedProfiles = await db.query.memberDietaryProfiles.findMany({
    where: and(inArray(memberDietaryProfiles.id, ids), eq(memberDietaryProfiles.userId, user.id)),
    columns: { id: true },
  });
  if (ownedProfiles.length !== ids.length) throw new DomainError('NOT_FOUND');

  return db.query.customDietaryRestrictions.findMany({
    where: and(
      inArray(customDietaryRestrictions.profileId, ids),
      isNull(customDietaryRestrictions.archivedAt),
    ),
    orderBy: [asc(customDietaryRestrictions.createdAt), asc(customDietaryRestrictions.id)],
    with: {
      terms: {
        orderBy: [
          asc(customDietaryRestrictionTerms.createdAt),
          asc(customDietaryRestrictionTerms.id),
        ],
      },
    },
  });
}
