import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { comments, ratings, type CommentKind } from "~/server/db/schema";

export type ThreadedComment = {
  id: string;
  kind: CommentKind;
  body: string;
  resolvedAt: Date | null;
  appliedAt: Date | null;
  createdAt: Date;
  parentId: string | null;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
  replies: ThreadedComment[];
};

/** Returns arbitrary-depth threads assembled from a single ordered comment query. */
export async function getRecipeComments(
  recipeId: string,
): Promise<ThreadedComment[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.comments.findMany({
    where: eq(comments.recipeId, recipeId),
    orderBy: [
      desc(
        sql<number>`case when ${comments.kind} = 'suggestion' and ${comments.resolvedAt} is null and ${comments.appliedAt} is null then 1 else 0 end`,
      ),
      asc(comments.createdAt),
    ],
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          handle: true,
          avatarUrl: true,
        },
      },
    },
  });

  const byId = new Map<string, ThreadedComment>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      kind: row.kind,
      body: row.body,
      resolvedAt: row.resolvedAt,
      appliedAt: row.appliedAt,
      createdAt: row.createdAt,
      parentId: row.parentId,
      author: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            handle: row.user.handle,
            avatarUrl: row.user.avatarUrl,
          }
        : null,
      replies: [],
    });
  }

  const roots: ThreadedComment[] = [];
  for (const row of rows) {
    const thread = byId.get(row.id);
    if (!thread) continue;
    const parent = row.parentId ? byId.get(row.parentId) : null;
    if (parent) {
      parent.replies.push(thread);
    } else {
      roots.push(thread);
    }
  }

  return roots;
}

export async function getViewerRating(
  recipeId: string,
  userId: string | null,
): Promise<number | null> {
  if (!isDbConfigured() || !userId) return null;

  const rating = await db.query.ratings.findFirst({
    where: and(eq(ratings.recipeId, recipeId), eq(ratings.userId, userId)),
    columns: { value: true },
  });

  return rating?.value ?? null;
}
