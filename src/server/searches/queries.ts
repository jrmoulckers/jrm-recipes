import "server-only";

import { desc, eq } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { savedSearches } from "~/server/db/schema";

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  createdAt: Date;
};

/** List a user's saved searches, newest first. Empty when signed out / no DB. */
export async function listMySavedSearches(
  userId: string | undefined,
): Promise<SavedSearch[]> {
  if (!isDbConfigured() || !userId) return [];
  return db.query.savedSearches.findMany({
    where: eq(savedSearches.userId, userId),
    orderBy: desc(savedSearches.createdAt),
    columns: { id: true, name: true, query: true, createdAt: true },
  });
}
