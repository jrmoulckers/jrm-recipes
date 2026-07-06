import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { cookLogEntries } from "~/server/db/schema";

/** A single cook-log entry, shaped for rendering a timeline row. */
export type CookLogItem = {
  id: string;
  cookedAt: Date;
  note: string | null;
  photoUrl: string | null;
  servingsMade: number | null;
};

/** A recent cook plus the recipe it belongs to (for the personal journal). */
export type RecentCookItem = CookLogItem & {
  recipe: {
    id: string;
    slug: string;
    title: string;
    coverImageUrl: string | null;
  } | null;
};

/**
 * The viewer's own cooks of a single recipe, newest first. Scoped to the
 * viewer so the journal stays personal (no leaking who else cooked a shared
 * family recipe).
 */
export async function getRecipeCookLog(
  recipeId: string,
  userId: string | null,
): Promise<CookLogItem[]> {
  if (!isDbConfigured() || !userId) return [];
  const rows = await db.query.cookLogEntries.findMany({
    where: and(
      eq(cookLogEntries.recipeId, recipeId),
      eq(cookLogEntries.userId, userId),
    ),
    orderBy: [desc(cookLogEntries.cookedAt)],
    columns: {
      id: true,
      cookedAt: true,
      note: true,
      photoUrl: true,
      servingsMade: true,
    },
  });
  return rows;
}

/** How many times the viewer has cooked a recipe. */
export async function getCookCount(
  recipeId: string,
  userId: string | null,
): Promise<number> {
  if (!isDbConfigured() || !userId) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(cookLogEntries)
    .where(
      and(
        eq(cookLogEntries.recipeId, recipeId),
        eq(cookLogEntries.userId, userId),
      ),
    );
  return row?.value ?? 0;
}

/** The viewer's most recent cooks across every recipe (their journal feed). */
export async function getMyRecentCooks(
  userId: string,
  limit = 24,
): Promise<RecentCookItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.cookLogEntries.findMany({
    where: eq(cookLogEntries.userId, userId),
    orderBy: [desc(cookLogEntries.cookedAt)],
    limit,
    columns: {
      id: true,
      cookedAt: true,
      note: true,
      photoUrl: true,
      servingsMade: true,
    },
    with: {
      recipe: {
        columns: { id: true, slug: true, title: true, coverImageUrl: true },
      },
    },
  });
  return rows;
}
