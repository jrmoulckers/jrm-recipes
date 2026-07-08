import "server-only";

import { and, eq, gte, inArray, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { groupMembers, recipes, users } from "~/server/db/schema";
import { type DigestGroup, type DigestRecipe } from "./builder";

/** A user who has opted in to the weekly digest and can be emailed. */
export interface DigestRecipient {
  id: string;
  email: string | null;
  name: string | null;
}

/** Everyone opted in to the weekly digest (issue #354). */
export async function listDigestRecipients(): Promise<DigestRecipient[]> {
  if (!isDbConfigured()) return [];
  return db.query.users.findMany({
    where: eq(users.weeklyDigestOptIn, true),
    columns: { id: true, email: true, name: true },
  });
}

/**
 * The raw material for one recipient's digest: the groups they belong to and
 * every recipe in those groups touched since `since`. Scoping/windowing is left
 * to {@link buildWeeklyDigest} so this stays a thin, well-indexed read. The
 * `groupId IN (their groups)` filter means a recipient can never be handed a
 * recipe from a group they aren't in.
 */
export async function getUserDigestData(
  userId: string,
  since: Date,
): Promise<{ groups: DigestGroup[]; recipes: DigestRecipe[] }> {
  if (!isDbConfigured()) return { groups: [], recipes: [] };

  const memberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    with: { group: { columns: { id: true, name: true } } },
  });

  const groups: DigestGroup[] = memberships.map((m) => ({
    id: m.group.id,
    name: m.group.name,
  }));
  const groupIds = groups.map((g) => g.id);
  if (groupIds.length === 0) return { groups, recipes: [] };

  const rows = await db.query.recipes.findMany({
    where: and(
      inArray(recipes.groupId, groupIds),
      or(gte(recipes.createdAt, since), gte(recipes.updatedAt, since)),
    ),
    columns: {
      id: true,
      slug: true,
      title: true,
      groupId: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
    },
    with: { author: { columns: { name: true } } },
  });

  const recipeData: DigestRecipe[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    groupId: r.groupId,
    visibility: r.visibility,
    authorName: r.author?.name ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return { groups, recipes: recipeData };
}
