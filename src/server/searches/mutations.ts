import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { savedSearches, type User } from "~/server/db/schema";
import {
  parseRecipeSearch,
  recipeSearchToQueryString,
  type RawSearchParams,
} from "~/server/recipes/search";
import { MAX_SAVED_SEARCHES, type SavedSearchInput } from "./validation";

/**
 * Re-normalize an incoming querystring through the search contract so we only
 * ever persist clean, valid params (and reject searches with no active filters).
 * Also collapses repeated keys (`tag=a&tag=b`) back into arrays for the parser.
 */
export function canonicalizeQuery(query: string): string {
  const params = new URLSearchParams(
    query.startsWith("?") ? query.slice(1) : query,
  );
  const raw: RawSearchParams = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return recipeSearchToQueryString(parseRecipeSearch(raw));
}

/**
 * Create (or update-in-place when the name already exists) a saved search for
 * the user. Enforces the per-user cap and rejects empty searches. Throws
 * `EMPTY_SEARCH` / `LIMIT_REACHED` for the action layer to translate.
 */
export async function createSavedSearch(input: SavedSearchInput, user: User) {
  const query = canonicalizeQuery(input.query);
  if (query.length === 0) throw new Error("EMPTY_SEARCH");

  return db.transaction(async (tx) => {
    const existing = await tx.query.savedSearches.findFirst({
      where: and(
        eq(savedSearches.userId, user.id),
        eq(savedSearches.name, input.name),
      ),
      columns: { id: true },
    });

    if (!existing) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(savedSearches)
        .where(eq(savedSearches.userId, user.id));
      if ((row?.count ?? 0) >= MAX_SAVED_SEARCHES) {
        throw new Error("LIMIT_REACHED");
      }
    }

    const [saved] = await tx
      .insert(savedSearches)
      .values({ userId: user.id, name: input.name, query })
      .onConflictDoUpdate({
        target: [savedSearches.userId, savedSearches.name],
        set: { query, updatedAt: new Date() },
      })
      .returning({ id: savedSearches.id });
    if (!saved) throw new Error("CONFLICT");
    return saved;
  });
}

export async function deleteSavedSearch(id: string, user: User) {
  const [row] = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)))
    .returning({ id: savedSearches.id });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
