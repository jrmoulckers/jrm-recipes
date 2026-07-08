import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { DomainError } from "~/server/errors";
import { assertKidAllowed } from "~/server/groups/kid-safe";
import { canViewRecipe } from "~/server/recipes/queries";
import {
  comments,
  groupMembers,
  ratings,
  recipeEvents,
  recipes,
  type Comment,
  type Rating,
  type User,
} from "~/server/db/schema";
import type { CommentInput, RatingInput } from "./validation";
import { contributorLabel, mergeSuggestionIntoNotes } from "./suggestions";
import { loadMentionCandidates } from "./mention-targets";
import { notify } from "~/server/notifications/notify";
import { resolveMentions } from "~/lib/mentions";

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
        title: true,
        authorId: true,
        visibility: true,
        groupId: true,
      },
    });
    if (!recipe) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(recipe, user))) throw new DomainError("FORBIDDEN");

    let parentAuthorId: string | null = null;
    if (input.parentId) {
      const parent = await tx.query.comments.findFirst({
        where: and(
          eq(comments.id, input.parentId),
          eq(comments.recipeId, input.recipeId),
        ),
        columns: { id: true, userId: true },
      });
      if (!parent) throw new DomainError("NOT_FOUND");
      parentAuthorId = parent.userId;
    }

    // Anchor a suggestion to a specific ingredient/step (#346). Only stored for
    // suggestions; a plain comment is always whole-recipe. The label is a
    // snapshot so the reference still reads sensibly if the target is later
    // edited or removed.
    const isSuggestion = input.kind === "suggestion";
    const anchorType =
      isSuggestion && input.anchorType ? input.anchorType : null;
    const anchorId = anchorType && input.anchorId ? input.anchorId : null;
    const anchorLabel =
      anchorType && input.anchorLabel ? input.anchorLabel : null;

    const [created] = await tx
      .insert(comments)
      .values({
        recipeId: input.recipeId,
        userId: user.id,
        parentId: input.parentId ?? null,
        kind: input.kind,
        body: input.body,
        anchorType,
        anchorId,
        anchorLabel,
      })
      .returning();

    // Social notifications (#340/#348), written in the same tx so they land
    // atomically with the comment. notify() no-ops on self-actions.
    const mentioned = resolveMentions(
      input.body,
      await loadMentionCandidates(tx, input.recipeId),
    );
    const mentionedIds = new Set<string>();
    for (const target of mentioned) {
      mentionedIds.add(target.id);
      await notify(tx, {
        recipientId: target.id,
        actorId: user.id,
        type: "mention",
        recipeId: input.recipeId,
        entityId: created!.id,
        context: recipe.title,
      });
    }
    // Notify the parent comment's author of a reply — unless they were already
    // @mentioned in the same comment (avoid a double ping).
    if (parentAuthorId && !mentionedIds.has(parentAuthorId)) {
      await notify(tx, {
        recipientId: parentAuthorId,
        actorId: user.id,
        type: "comment_reply",
        recipeId: input.recipeId,
        entityId: created!.id,
        context: recipe.title,
      });
    }

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

    if (!comment) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(comment.recipe, user))) {
      throw new DomainError("FORBIDDEN");
    }
    if (comment.userId !== user.id && comment.recipe.authorId !== user.id) {
      throw new DomainError("FORBIDDEN");
    }
    // Kid-safe (issue #345): the kid role can comment but never delete — not even
    // their own — so a child can't quietly erase family conversation.
    if (comment.recipe.groupId) {
      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, comment.recipe.groupId),
          eq(groupMembers.userId, user.id),
        ),
        columns: { role: true },
      });
      if (membership) assertKidAllowed(membership.role, "delete_comment");
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

    if (!comment) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(comment.recipe, user))) {
      throw new DomainError("FORBIDDEN");
    }
    if (comment.kind !== "suggestion" || comment.recipe.authorId !== user.id) {
      throw new DomainError("FORBIDDEN");
    }

    // A suggestion that's already been folded into the recipe can't be reopened
    // (resolved=false); doing so would leave an applied-but-unresolved entry.
    if (!resolved && comment.appliedAt) throw new DomainError("ALREADY_APPLIED");

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

    if (!suggestion) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(suggestion.recipe, user))) {
      throw new DomainError("FORBIDDEN");
    }
    if (
      suggestion.kind !== "suggestion" ||
      suggestion.recipe.authorId !== user.id
    ) {
      throw new DomainError("FORBIDDEN");
    }
    if (suggestion.appliedAt) throw new DomainError("ALREADY_APPLIED");

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
    if (!recipe) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(recipe, user))) throw new DomainError("FORBIDDEN");
    // Integrity: authors can't rate their own recipe — a self-rating would
    // inflate both the average and the JSON-LD aggregateRating.
    if (recipe.authorId === user.id) throw new DomainError("SELF_RATING");

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
      throw new DomainError("FORBIDDEN");
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
