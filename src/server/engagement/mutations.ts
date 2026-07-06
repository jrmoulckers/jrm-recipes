import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import { canViewRecipe } from "~/server/recipes/queries";
import {
  comments,
  ratings,
  recipes,
  type Comment,
  type Rating,
  type User,
} from "~/server/db/schema";
import type { CommentInput, RatingInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function collectDescendantIds(tx: Tx, parentIds: string[]) {
  const seen = new Set(parentIds);
  const descendants: string[] = [];
  let frontier = parentIds;

  while (frontier.length > 0) {
    const rows = await tx.query.comments.findMany({
      where: inArray(comments.parentId, frontier),
      columns: { id: true },
    });
    frontier = rows.map((row) => row.id).filter((id) => !seen.has(id));
    for (const id of frontier) {
      seen.add(id);
      descendants.push(id);
    }
  }

  return descendants;
}

export async function createComment(
  input: CommentInput,
  user: User,
): Promise<Comment> {
  return db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      columns: {
        id: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
    });
    if (!recipe) throw new Error("NOT_FOUND");
    if (!(await canViewRecipe(recipe, user))) throw new Error("FORBIDDEN");

    if (input.parentId) {
      const parent = await tx.query.comments.findFirst({
        where: and(
          eq(comments.id, input.parentId),
          eq(comments.recipeId, input.recipeId),
        ),
        columns: { id: true },
      });
      if (!parent) throw new Error("NOT_FOUND");
    }

    const [created] = await tx
      .insert(comments)
      .values({
        recipeId: input.recipeId,
        userId: user.id,
        parentId: input.parentId ?? null,
        kind: input.kind,
        body: input.body,
      })
      .returning();

    return created!;
  });
}

export async function deleteComment(
  commentId: string,
  user: User,
): Promise<void> {
  await db.transaction(async (tx) => {
    const comment = await tx.query.comments.findFirst({
      where: eq(comments.id, commentId),
      columns: { id: true, userId: true },
      with: {
        recipe: {
          columns: { authorId: true },
        },
      },
    });

    if (!comment) throw new Error("NOT_FOUND");
    if (comment.userId !== user.id && comment.recipe.authorId !== user.id) {
      throw new Error("FORBIDDEN");
    }

    const descendants = await collectDescendantIds(tx, [commentId]);
    if (descendants.length > 0) {
      await tx.delete(comments).where(inArray(comments.id, descendants));
    }
    await tx.delete(comments).where(eq(comments.id, commentId));
  });
}

export async function resolveComment(
  commentId: string,
  user: User,
  resolved: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const comment = await tx.query.comments.findFirst({
      where: eq(comments.id, commentId),
      columns: { id: true, kind: true },
      with: {
        recipe: {
          columns: { authorId: true },
        },
      },
    });

    if (!comment) throw new Error("NOT_FOUND");
    if (comment.kind !== "suggestion" || comment.recipe.authorId !== user.id) {
      throw new Error("FORBIDDEN");
    }

    await tx
      .update(comments)
      .set({ resolvedAt: resolved ? new Date() : null, updatedAt: new Date() })
      .where(eq(comments.id, commentId));
  });
}

export async function setRating(
  input: RatingInput,
  user: User,
): Promise<Rating | undefined> {
  return db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      columns: {
        id: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
    });
    if (!recipe) throw new Error("NOT_FOUND");
    if (!(await canViewRecipe(recipe, user))) throw new Error("FORBIDDEN");

    const [rating] = await tx
      .insert(ratings)
      .values({
        recipeId: input.recipeId,
        userId: user.id,
        value: input.value,
      })
      .onConflictDoUpdate({
        target: [ratings.recipeId, ratings.userId],
        set: { value: input.value, updatedAt: new Date() },
      })
      .returning();

    return rating;
  });
}

export async function removeRating(recipeId: string, user: User): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(ratings)
      .where(and(eq(ratings.recipeId, recipeId), eq(ratings.userId, user.id)));
  });
}
