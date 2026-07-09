import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { cookLogEntries, groupMembers, recipes } from "~/server/db/schema";
import type { User } from "~/server/db/schema";

/**
 * First-run onboarding signals derived entirely from the user's real data
 * (#78). No new tables or columns: each flag is a cheap "does at least one row
 * exist?" probe against data the app already stores, so the home checklist can
 * reflect genuine progress through the create → cook → share loop.
 */
export interface OnboardingProgress {
  /** The user has authored at least one (non-deleted) recipe. */
  hasRecipe: boolean;
  /** The user has logged at least one cook. */
  hasCooked: boolean;
  /** The user belongs to at least one family/group. */
  hasShared: boolean;
}

export const EMPTY_ONBOARDING_PROGRESS: OnboardingProgress = {
  hasRecipe: false,
  hasCooked: false,
  hasShared: false,
};

/** Whether every onboarding step is done (so the checklist can retire itself). */
export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return progress.hasRecipe && progress.hasCooked && progress.hasShared;
}

/**
 * Reads the three onboarding signals in one parallel round of existence checks.
 * Returns all-false without a database so callers can render safely in any
 * environment.
 */
export async function getOnboardingProgress(
  user: User,
): Promise<OnboardingProgress> {
  if (!isDbConfigured()) return EMPTY_ONBOARDING_PROGRESS;

  const [recipeRow, cookRow, groupRow] = await Promise.all([
    db.query.recipes.findFirst({
      where: and(eq(recipes.authorId, user.id), isNull(recipes.deletedAt)),
      columns: { id: true },
    }),
    db.query.cookLogEntries.findFirst({
      where: eq(cookLogEntries.userId, user.id),
      columns: { id: true },
    }),
    db.query.groupMembers.findFirst({
      where: eq(groupMembers.userId, user.id),
      columns: { groupId: true },
    }),
  ]);

  return {
    hasRecipe: Boolean(recipeRow),
    hasCooked: Boolean(cookRow),
    hasShared: Boolean(groupRow),
  };
}
