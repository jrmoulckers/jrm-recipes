import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, isDbConfigured } from "~/server/db";
import { recipes, reviews, type Review, type User } from "~/server/db/schema";
import { canViewRecipe } from "./queries";
import { nextPageOffset, type Paginated } from "./pagination";

/** Default page size for a recipe's review list. */
export const REVIEWS_PAGE_SIZE = 20;

/**
 * Validated input for creating/editing the viewer's own review (issue #174).
 * `rating` mirrors the DB `reviews_rating_range_check` (1–5); empty title/body
 * normalise to NULL so a blank field isn't stored as "".
 */
export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  body: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});
export type ReviewInput = z.input<typeof reviewInput>;

/** Minimal recipe fields needed to gate review read/write on visibility. */
async function activeRecipeForGating(recipeId: string) {
  const recipe = await db.query.recipes.findFirst({
    where: and(isNull(recipes.deletedAt), eq(recipes.id, recipeId)),
    columns: { id: true, authorId: true, visibility: true, groupId: true },
  });
  return recipe ?? null;
}

/**
 * A review row joined with a compact reviewer identity for rendering a list.
 * Kept explicit (rather than derived from the query) so the public return type
 * of {@link listRecipeReviews} doesn't reference itself.
 */
export type ReviewListItem = Review & {
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  };
};

/**
 * List a recipe's reviews (newest first, offset-paginated), gated so a viewer
 * only sees reviews on a recipe they may view (issue #174). Returns an empty
 * page when the DB is off, the recipe is missing/soft-deleted, or the viewer
 * can't see it — never leaking that the recipe exists.
 */
export async function listRecipeReviews(
  recipeId: string,
  viewer: User | null,
  {
    limit = REVIEWS_PAGE_SIZE,
    offset = 0,
  }: { limit?: number; offset?: number } = {},
): Promise<Paginated<ReviewListItem>> {
  if (!isDbConfigured()) return { items: [], nextOffset: null };
  const recipe = await activeRecipeForGating(recipeId);
  if (!recipe || !(await canViewRecipe(recipe, viewer)))
    return { items: [], nextOffset: null };

  const items = await db.query.reviews.findMany({
    where: eq(reviews.recipeId, recipeId),
    orderBy: [desc(reviews.createdAt), desc(reviews.id)],
    limit,
    offset,
    with: {
      user: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });

  return { items, nextOffset: nextPageOffset(offset, items.length, limit) };
}

/**
 * Create or edit the viewer's own review of a recipe (issue #174). At most one
 * review per user per recipe: a re-review updates the existing row in place and
 * stamps `editedAt`, resolved at the DB through the `reviews_recipe_user_uq`
 * constraint. Gated by {@link canViewRecipe} so a user can't review a recipe
 * they can't see. Throws `NOT_FOUND` / `FORBIDDEN` to mirror the mutation layer.
 */
export async function upsertMyReview(
  recipeId: string,
  user: User,
  input: ReviewInput,
): Promise<Review> {
  const data = reviewInput.parse(input);
  const recipe = await activeRecipeForGating(recipeId);
  if (!recipe) throw new Error("NOT_FOUND");
  if (!(await canViewRecipe(recipe, user))) throw new Error("FORBIDDEN");

  const [row] = await db
    .insert(reviews)
    .values({
      recipeId,
      userId: user.id,
      rating: data.rating,
      title: data.title,
      body: data.body,
    })
    .onConflictDoUpdate({
      target: [reviews.recipeId, reviews.userId],
      set: {
        rating: data.rating,
        title: data.title,
        body: data.body,
        editedAt: new Date(),
      },
    })
    .returning();
  return row!;
}
