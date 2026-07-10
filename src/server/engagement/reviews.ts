import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { DomainError } from "~/server/errors";
import { canViewRecipe } from "~/server/recipes/queries";
import { notify } from "~/server/notifications/notify";
import { reviews, recipes, type Review, type User } from "~/server/db/schema";
import type { ReviewInput } from "./validation";

export type ReviewSort = "recent" | "rating";

/** One review shaped for the reviews section list. */
export type ReviewListItem = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  photoUrl: string | null;
  createdAt: Date;
  editedAt: Date | null;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
};

/** Blank strings from the composer become NULL so "no title/photo" is real null. */
function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * List a recipe's visible reviews (issue #341). Hidden reviews (moderation,
 * #357) are excluded here; the moderation queue reads them separately. Access to
 * the recipe itself is enforced by the page before this renders.
 */
export async function listReviews(
  recipeId: string,
  sort: ReviewSort = "recent",
  hiddenAuthorIds = new Set<string>(),
): Promise<ReviewListItem[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.reviews.findMany({
    where: and(eq(reviews.recipeId, recipeId), isNull(reviews.hiddenAt)),
    orderBy:
      sort === "rating"
        ? [desc(reviews.rating), desc(reviews.createdAt)]
        : [desc(reviews.createdAt)],
    with: {
      user: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });

  return rows
    .filter((row) => !row.userId || !hiddenAuthorIds.has(row.userId))
    .map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      photoUrl: row.photoUrl,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      author: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            handle: row.user.handle,
            avatarUrl: row.user.avatarUrl,
          }
        : null,
    }));
}

/** The viewer's own review for a recipe, if any (prefills the composer). */
export async function getViewerReview(
  recipeId: string,
  userId: string | null,
): Promise<Review | null> {
  if (!isDbConfigured() || !userId) return null;
  const row = await db.query.reviews.findFirst({
    where: and(eq(reviews.recipeId, recipeId), eq(reviews.userId, userId)),
  });
  return row ?? null;
}

/**
 * Create or edit the viewer's review (one per user per recipe, #341). The
 * unique (recipeId, userId) constraint makes this an upsert: a second submit
 * edits in place and stamps `editedAt`. A brand-new review notifies the recipe
 * author (notify() no-ops on a self-review).
 */
export async function upsertReview(
  input: ReviewInput,
  user: User,
): Promise<Review> {
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
    if (!(await canViewRecipe(recipe, user)))
      throw new DomainError("FORBIDDEN");

    const existing = await tx.query.reviews.findFirst({
      where: and(
        eq(reviews.recipeId, input.recipeId),
        eq(reviews.userId, user.id),
      ),
      columns: { id: true },
    });

    const now = new Date();
    const title = emptyToNull(input.title);
    const body = emptyToNull(input.body);
    const photoUrl = emptyToNull(input.photoUrl);

    const [row] = await tx
      .insert(reviews)
      .values({
        recipeId: input.recipeId,
        userId: user.id,
        rating: input.rating,
        title,
        body,
        photoUrl,
      })
      .onConflictDoUpdate({
        target: [reviews.recipeId, reviews.userId],
        set: {
          rating: input.rating,
          title,
          body,
          photoUrl,
          editedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (!existing && recipe.authorId) {
      await notify(tx, {
        recipientId: recipe.authorId,
        actorId: user.id,
        type: "review",
        recipeId: recipe.id,
        entityId: row!.id,
        context: recipe.title,
      });
    }

    return row!;
  });
}

/**
 * Delete a review. The author can delete their own; the recipe owner can delete
 * any review on their recipe (lightweight moderation before #357).
 */
export async function deleteReview(
  reviewId: string,
  user: User,
): Promise<void> {
  await db.transaction(async (tx) => {
    const review = await tx.query.reviews.findFirst({
      where: eq(reviews.id, reviewId),
      columns: { id: true, userId: true },
      with: {
        recipe: {
          columns: { authorId: true, visibility: true, groupId: true },
        },
      },
    });
    if (!review) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(review.recipe, user))) {
      throw new DomainError("FORBIDDEN");
    }
    if (review.userId !== user.id && review.recipe.authorId !== user.id) {
      throw new DomainError("FORBIDDEN");
    }
    await tx.delete(reviews).where(eq(reviews.id, reviewId));
  });
}
