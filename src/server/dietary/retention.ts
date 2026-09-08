import 'server-only';

import { and, isNotNull, lt } from 'drizzle-orm';

import { db } from '~/server/db';
import { dietaryAssessments, dietaryIngredientCorrections } from '~/server/db/schema';

export const DIETARY_HISTORY_RETENTION_DAYS = 30;

export type DietaryRetentionResult = {
  assessmentsDeleted: number;
  correctionsDeleted: number;
};

/**
 * Remove superseded dietary facts after the bounded rollback window.
 * Evidence cascades with its assessment; revoked corrections are deleted only
 * after old assessments can no longer reference them.
 */
export async function purgeExpiredDietaryHistory(
  now: Date = new Date(),
): Promise<DietaryRetentionResult> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - DIETARY_HISTORY_RETENTION_DAYS);

  return db.transaction(async (tx) => {
    const assessments = await tx
      .delete(dietaryAssessments)
      .where(
        and(
          isNotNull(dietaryAssessments.invalidatedAt),
          lt(dietaryAssessments.invalidatedAt, cutoff),
        ),
      )
      .returning({ id: dietaryAssessments.id });
    const corrections = await tx
      .delete(dietaryIngredientCorrections)
      .where(
        and(
          isNotNull(dietaryIngredientCorrections.revokedAt),
          lt(dietaryIngredientCorrections.revokedAt, cutoff),
        ),
      )
      .returning({ id: dietaryIngredientCorrections.id });

    return {
      assessmentsDeleted: assessments.length,
      correctionsDeleted: corrections.length,
    };
  });
}
