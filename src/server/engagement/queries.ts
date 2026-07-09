import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { comments, ratings, recipes, type CommentKind } from "~/server/db/schema";
import { canViewRecipe } from "~/server/recipes/queries";
import { excludeOwnerRatings, ratingBreakdown } from "~/lib/ratings";
import type { RatingBreakdown } from "~/lib/ratings";
import type { User } from "~/server/db/schema";
import type { MentionCandidate } from "~/lib/mentions";
import { loadMentionCandidates } from "./mention-targets";

export type ThreadedComment = {
  id: string;
  kind: CommentKind;
  body: string;
  anchorType: "ingredient" | "step" | null;
  anchorId: string | null;
  anchorLabel: string | null;
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
  options: {
    /** Authors to hide from the viewer (personal blocks, #355). */
    hiddenAuthorIds?: Set<string>;
    /** Show moderation-hidden comments (owners/admins only, #357). */
    includeHidden?: boolean;
  } = {},
): Promise<ThreadedComment[]> {
  if (!isDbConfigured()) return [];

  const hiddenAuthorIds = options.hiddenAuthorIds ?? new Set<string>();
  const allRows = await db.query.comments.findMany({
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

  // Drop moderation-hidden comments (unless the viewer manages the group) and
  // any comment authored by someone the viewer has blocked (#355/#357).
  const rows = allRows.filter((row) => {
    if (row.hiddenAt && !options.includeHidden) return false;
    if (row.userId && hiddenAuthorIds.has(row.userId)) return false;
    return true;
  });

  const byId = new Map<string, ThreadedComment>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      kind: row.kind,
      body: row.body,
      anchorType: row.anchorType,
      anchorId: row.anchorId,
      anchorLabel: row.anchorLabel,
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

/** An open suggestion anchored to a specific ingredient/step (issue #346). */
export type AnchoredSuggestion = {
  id: string;
  anchorType: "ingredient" | "step";
  anchorId: string;
  anchorLabel: string | null;
  body: string;
  resolvedAt: Date | null;
  appliedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
  } | null;
};

/**
 * Suggestions anchored to an ingredient/step (issue #346), for rendering inline
 * next to their target. Excludes hidden (moderated) rows. The caller indexes
 * these by `anchorId` to attach them to each ingredient row / method step.
 */
export async function getAnchoredSuggestions(
  recipeId: string,
): Promise<AnchoredSuggestion[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.comments.findMany({
    where: and(
      eq(comments.recipeId, recipeId),
      eq(comments.kind, "suggestion"),
      isNotNull(comments.anchorId),
      isNull(comments.hiddenAt),
    ),
    orderBy: [asc(comments.createdAt)],
    with: {
      user: { columns: { id: true, name: true, handle: true } },
    },
  });

  const result: AnchoredSuggestion[] = [];
  for (const row of rows) {
    if (!row.anchorType || !row.anchorId) continue;
    result.push({
      id: row.id,
      anchorType: row.anchorType,
      anchorId: row.anchorId,
      anchorLabel: row.anchorLabel,
      body: row.body,
      resolvedAt: row.resolvedAt,
      appliedAt: row.appliedAt,
      createdAt: row.createdAt,
      author: row.user
        ? { id: row.user.id, name: row.user.name, handle: row.user.handle }
        : null,
    });
  }
  return result;
}

/**
 * The members who can be @mentioned on this recipe (issue #340): the recipe
 * author plus its group. Given to the composer for autocomplete and reused by
 * the renderer to resolve which `@handles` become links.
 */
export async function getMentionCandidates(
  recipeId: string,
): Promise<MentionCandidate[]> {
  if (!isDbConfigured()) return [];
  return loadMentionCandidates(db, recipeId);
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

/** A member who rated, shown as a small avatar in the breakdown (#334). */
export type RaterAvatar = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
};

/** Average + count + 5→1 distribution plus capped rater avatars for a recipe. */
export type RatingBreakdownResult = RatingBreakdown & {
  raters: RaterAvatar[];
  totalRaters: number;
};

const EMPTY_BREAKDOWN: RatingBreakdownResult = {
  average: 0,
  count: 0,
  distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 })),
  raters: [],
  totalRaters: 0,
};

/**
 * Per-family rating breakdown for a recipe (issue #334): the average, count,
 * a 5→1 star distribution, and up to `avatarLimit` rater avatars (highest stars
 * first). Owner self-ratings are excluded to match the summary shown elsewhere.
 * Rater identities are only returned to a viewer who can see the recipe, so a
 * non-member never learns who in a private family rated it.
 */
export async function getRatingBreakdown(
  recipeId: string,
  viewer: User | null,
  avatarLimit = 8,
): Promise<RatingBreakdownResult> {
  if (!isDbConfigured()) return EMPTY_BREAKDOWN;

  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, authorId: true, visibility: true, groupId: true },
  });
  if (!recipe) return EMPTY_BREAKDOWN;

  const rows = await db.query.ratings.findMany({
    where: eq(ratings.recipeId, recipeId),
    orderBy: [desc(ratings.value), desc(ratings.createdAt)],
    with: {
      user: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });

  const scored = excludeOwnerRatings(rows, recipe.authorId);
  const breakdown = ratingBreakdown(scored);

  const canSeeRaters = await canViewRecipe(recipe, viewer);
  const raters: RaterAvatar[] = canSeeRaters
    ? scored
        .filter((row) => row.user)
        .slice(0, avatarLimit)
        .map((row) => ({
          id: row.user.id,
          name: row.user.name,
          handle: row.user.handle,
          avatarUrl: row.user.avatarUrl,
        }))
    : [];

  return {
    ...breakdown,
    raters,
    totalRaters: canSeeRaters ? scored.length : 0,
  };
}

