import 'server-only';

import { and, eq, inArray, or } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import {
  dietaryAssessments,
  dietaryIngredientCorrections,
  memberDietaryProfiles,
} from '~/server/db/schema';

export type DietaryDataExport = {
  profiles: Awaited<ReturnType<typeof loadProfiles>>;
  assessments: Awaited<ReturnType<typeof loadAssessments>>;
  corrections: Awaited<ReturnType<typeof loadCorrections>>;
};

async function loadProfiles(userId: string) {
  return db.query.memberDietaryProfiles.findMany({
    where: eq(memberDietaryProfiles.userId, userId),
    with: {
      customRestrictions: {
        with: { terms: true },
      },
    },
  });
}

async function loadAssessments(userId: string, profileIds: string[]) {
  const ownedScope =
    profileIds.length === 0
      ? eq(dietaryAssessments.ownerUserId, userId)
      : or(
          eq(dietaryAssessments.ownerUserId, userId),
          inArray(dietaryAssessments.profileId, profileIds),
        );
  return db.query.dietaryAssessments.findMany({
    where: or(
      ownedScope,
      and(eq(dietaryAssessments.scope, 'canonical'), eq(dietaryAssessments.createdById, userId)),
    ),
    with: { evidence: true },
  });
}

async function loadCorrections(userId: string) {
  return db.query.dietaryIngredientCorrections.findMany({
    where: eq(dietaryIngredientCorrections.actorId, userId),
  });
}

/**
 * Export only data the user owns or authored. Visibility of a shared recipe is
 * not enough to export every dietary fact attached to it, and another person's
 * profile never enters this query.
 */
export async function getDietaryDataForExport(userId: string): Promise<DietaryDataExport> {
  if (!isDbConfigured()) {
    return { profiles: [], assessments: [], corrections: [] };
  }
  const profiles = await loadProfiles(userId);
  const profileIds = profiles.map((profile) => profile.id);
  const [assessments, corrections] = await Promise.all([
    loadAssessments(userId, profileIds),
    loadCorrections(userId),
  ]);
  return { profiles, assessments, corrections };
}
