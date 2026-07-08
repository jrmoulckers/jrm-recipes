import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { canViewRecipe } from "~/server/recipes/queries";
import {
  comments,
  ratings,
  recipeEvents,
  recipes,
  type Comment,
  type Rating,
  type User,
} from "~/server/db/schema";
import type { CommentInput, RatingInput } from "./validation";
import { contributorLabel, mergeSuggestionIntoNotes } from "./suggestions";

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
          columns: {
            authorId: true,
            visibility: true,
            groupId: true,
          },
        },
      },
    });

    if (!comment) throw new Error("NOT_FOUND");
    if (!(await canViewRecipe(comment.recipe, user))) {
      throw new Error("FORBIDDEN");
    }
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
      columns: { id: true, kind: true, appliedAt: true },
      with: {
        recipe: {
          columns: {
            authorId: true,
            visibility: true,
            groupId: true,
          },
        },
      },
    });

    if (!comment) throw new Error("NOT_FOUND");
    if (!(await canViewRecipe(comment.recipe, user))) {
      throw new Error("FORBIDDEN");
    }
    if (comment.kind !== "suggestion" || comment.recipe.authorId !== user.id) {
      throw new Error("FORBIDDEN");
    }

    // A suggestion that's already been folded into the recipe can't be reopened
    // (resolved=false); doing so would leave an applied-but-unresolved entry.
    if (!resolved && comment.appliedAt) throw new Error("ALREADY_APPLIED");

    await tx
      .update(comments)
      .set({ resolvedAt: resolved ? new Date() : null, updatedAt: new Date() })
      .where(eq(comments.id, commentId));
  });
}

/**
 * Fold a suggestion's change into the recipe itself. Owner-only: mirrors
 * {@link resolveComment}'s gate (view access via {@link canViewRecipe}, then the
 * recipe author). Because suggestions are free-text tweaks to an existing
 * recipe, we apply IN PLACE — merging the suggestion into the recipe's notes,
 * credited to the contributor — rather than forking a new recipe. A
 * `suggestion_applied` timeline event attributes the contributor so the applied
 * tweak shows in the family history, and the suggestion is marked applied (and
 * resolved) so it isn't offered again.
 */
export async function applySuggestion(
  input: { recipeId: string; suggestionId: string },
  user: User,
): Promise<void> {
  await db.transaction(async (tx) => {
    const suggestion = await tx.query.comments.findFirst({
      where: and(
        eq(comments.id, input.suggestionId),
        eq(comments.recipeId, input.recipeId),
      ),
      columns: {
        id: true,
        kind: true,
        body: true,
        userId: true,
        appliedAt: true,
      },
      with: {
        recipe: {
          columns: {
            id: true,
            authorId: true,
            visibility: true,
            groupId: true,
            notes: true,
          },
        },
        user: { columns: { name: true, handle: true } },
      },
    });

    if (!suggestion) throw new Error("NOT_FOUND");
    if (!(await canViewRecipe(suggestion.recipe, user))) {
      throw new Error("FORBIDDEN");
    }
    if (
      suggestion.kind !== "suggestion" ||
      suggestion.recipe.authorId !== user.id
    ) {
      throw new Error("FORBIDDEN");
    }
    if (suggestion.appliedAt) throw new Error("ALREADY_APPLIED");

    const contributor = contributorLabel(suggestion.user);
    const mergedNotes = mergeSuggestionIntoNotes(
      suggestion.recipe.notes,
      suggestion.body,
      contributor,
    );

    const now = new Date();
    await tx
      .update(recipes)
      .set({ notes: mergedNotes, updatedAt: now })
      .where(eq(recipes.id, suggestion.recipe.id));

    await tx
      .update(comments)
      .set({ appliedAt: now, resolvedAt: now, updatedAt: now })
      .where(eq(comments.id, suggestion.id));

    // Attribute the contributor (not the applying owner) so the timeline credits
    // whose idea it was; the suggestion text rides along as the event note.
    await tx.insert(recipeEvents).values({
      recipeId: suggestion.recipe.id,
      actorId: suggestion.userId,
      type: "suggestion_applied",
      note: suggestion.body,
    });
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
    // Integrity: authors can't rate their own recipe — a self-rating would
    // inflate both the average and the JSON-LD aggregateRating.
    if (recipe.authorId === user.id) throw new Error("SELF_RATING");

    // Read the caller's prior rating (if any) so we can move the denormalized
    // aggregates by the exact delta (issue #154): a brand-new vote bumps count
    // and sum; changing an existing vote only shifts the sum.
    const previous = await tx.query.ratings.findFirst({
      where: and(
        eq(ratings.recipeId, input.recipeId),
        eq(ratings.userId, user.id),
      ),
      columns: { value: true },
    });

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

    const countDelta = previous ? 0 : 1;
    const sumDelta = input.value - (previous?.value ?? 0);
    if (countDelta !== 0 || sumDelta !== 0) {
      await tx
        .update(recipes)
        .set({
          ratingCount: sql`${recipes.ratingCount} + ${countDelta}`,
          ratingSum: sql`${recipes.ratingSum} + ${sumDelta}`,
        })
        .where(eq(recipes.id, input.recipeId));
    }

    return rating;
  });
}

export async function removeRating(recipeId: string, user: User): Promise<void> {
  await db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
      columns: {
        id: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
    });
    if (recipe && !(await canViewRecipe(recipe, user))) {
      throw new Error("FORBIDDEN");
    }

    // Find the caller's rating first so removing it can decrement the aggregates
    // by the right amount (issue #154). Only non-owner ratings are counted, so a
    // legacy owner self-rating (which the backfill excluded) is deleted without
    // touching the aggregate.
    const existing = await tx.query.ratings.findFirst({
      where: and(eq(ratings.recipeId, recipeId), eq(ratings.userId, user.id)),
      columns: { value: true },
    });

    await tx
      .delete(ratings)
      .where(and(eq(ratings.recipeId, recipeId), eq(ratings.userId, user.id)));

    if (existing && recipe && recipe.authorId !== user.id) {
      await tx
        .update(recipes)
        .set({
          ratingCount: sql`${recipes.ratingCount} - 1`,
          ratingSum: sql`${recipes.ratingSum} - ${existing.value}`,
        })
        .where(eq(recipes.id, recipeId));
    }
  });
}
