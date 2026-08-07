import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { customUnits, userUnitPreferences } from "~/server/db/schema";

/**
 * A user's saved unit preferences, or null when they've never set any (callers
 * then fall back to a locale default). Owner-scoped by construction. The unique
 * `user_id` means at most one row per user.
 */
export async function getUnitPreferences(userId: string) {
  return db.query.userUnitPreferences.findFirst({
    where: eq(userUnitPreferences.userId, userId),
  });
}

/**
 * Every custom unit a user has defined, oldest first so the list is stable as
 * new units are added. Owner-scoped: a cook only ever sees their own units.
 */
export async function listCustomUnits(userId: string) {
  return db.query.customUnits.findMany({
    where: eq(customUnits.userId, userId),
    orderBy: [asc(customUnits.createdAt), asc(customUnits.id)],
  });
}

/** Preferences + custom units in one round trip, for the settings page. */
export async function getUnitSettings(userId: string) {
  const [preferences, units] = await Promise.all([
    getUnitPreferences(userId),
    listCustomUnits(userId),
  ]);
  return { preferences: preferences ?? null, customUnits: units };
}
