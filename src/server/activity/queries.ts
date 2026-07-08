import "server-only";

import { and, desc, eq, inArray, isNull, lt, type Column } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { getHiddenAuthorIds } from "~/server/moderation/blocks";
import {
  comments,
  cookLogEntries,
  groupMembers,
  recipes,
  reviews,
  type MemberRole,
} from "~/server/db/schema";

/** The kinds of event the family activity feed surfaces (issue #349). */
export type ActivityKind =
  | "recipe_added"
  | "cook_shared"
  | "review"
  | "comment"
  | "suggestion"
  | "member_joined";

type Actor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
};

type RecipeRef = {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
};

/** One event in the feed. `id` is unique across kinds for a stable React key. */
export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  at: Date;
  actor: Actor | null;
  recipe: RecipeRef | null;
  text: string | null;
  photoUrl: string | null;
  rating: number | null;
};

export type ActivityPage = {
  events: ActivityEvent[];
  /** ISO timestamp to pass as `before` for the next page, or null at the end. */
  nextCursor: string | null;
};

const DEFAULT_LIMIT = 20;

/**
 * The family activity feed (issue #349): a reverse-chronological union of
 * recipes added, cooks shared to the group, reviews, comments/suggestions, and
 * new members. Member-only — non-members get an empty page so private family
 * activity never leaks. Cursor pagination is timestamp-based (`before`).
 */
export async function getGroupActivity(
  groupId: string,
  viewer: { id: string; role: MemberRole | null | undefined },
  opts: { limit?: number; before?: Date | null } = {},
): Promise<ActivityPage> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 50);
  // Membership gate: only members see the feed.
  if (!isDbConfigured() || !viewer.role) {
    return { events: [], nextCursor: null };
  }

  const before = opts.before ?? null;
  const beforeFilter = (column: Column) =>
    before ? lt(column, before) : undefined;

  // Recipes that belong to this group scope reviews/comments below.
  const groupRecipes = await db.query.recipes.findMany({
    where: eq(recipes.groupId, groupId),
    columns: {
      id: true,
      slug: true,
      title: true,
      coverImageUrl: true,
      createdAt: true,
    },
    with: {
      author: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });
  const recipeIds = groupRecipes.map((r) => r.id);
  const recipeById = new Map(groupRecipes.map((r) => [r.id, r]));

  const hidden = await getHiddenAuthorIds(viewer.id);

  const events: ActivityEvent[] = [];

  // 1) Recipes added to the group.
  for (const recipe of groupRecipes) {
    if (before && recipe.createdAt >= before) continue;
    events.push({
      id: `recipe:${recipe.id}`,
      kind: "recipe_added",
      at: recipe.createdAt,
      actor: recipe.author ?? null,
      recipe: {
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        coverImageUrl: recipe.coverImageUrl,
      },
      text: null,
      photoUrl: recipe.coverImageUrl,
      rating: null,
    });
  }

  // 2) Cooks shared to the group.
  const cooks = await db.query.cookLogEntries.findMany({
    where: and(
      eq(cookLogEntries.sharedToGroupId, groupId),
      isNull(cookLogEntries.hiddenAt),
      beforeFilter(cookLogEntries.createdAt),
    ),
    orderBy: [desc(cookLogEntries.createdAt)],
    limit,
    columns: {
      id: true,
      note: true,
      photoUrl: true,
      recipeId: true,
      userId: true,
      createdAt: true,
    },
    with: {
      user: { columns: { id: true, name: true, handle: true, avatarUrl: true } },
    },
  });
  for (const cook of cooks) {
    if (hidden.has(cook.userId)) continue;
    events.push({
      id: `cook:${cook.id}`,
      kind: "cook_shared",
      at: cook.createdAt,
      actor: cook.user ?? null,
      recipe: recipeById.get(cook.recipeId)
        ? {
            id: cook.recipeId,
            slug: recipeById.get(cook.recipeId)!.slug,
            title: recipeById.get(cook.recipeId)!.title,
            coverImageUrl: recipeById.get(cook.recipeId)!.coverImageUrl,
          }
        : null,
      text: cook.note,
      photoUrl: cook.photoUrl,
      rating: null,
    });
  }

  if (recipeIds.length > 0) {
    // 3) Reviews on group recipes.
    const reviewRows = await db.query.reviews.findMany({
      where: and(
        inArray(reviews.recipeId, recipeIds),
        isNull(reviews.hiddenAt),
        beforeFilter(reviews.createdAt),
      ),
      orderBy: [desc(reviews.createdAt)],
      limit,
      columns: {
        id: true,
        title: true,
        body: true,
        rating: true,
        recipeId: true,
        userId: true,
        createdAt: true,
      },
      with: {
        user: {
          columns: { id: true, name: true, handle: true, avatarUrl: true },
        },
      },
    });
    for (const review of reviewRows) {
      if (hidden.has(review.userId)) continue;
      const recipe = recipeById.get(review.recipeId);
      events.push({
        id: `review:${review.id}`,
        kind: "review",
        at: review.createdAt,
        actor: review.user ?? null,
        recipe: recipe
          ? {
              id: recipe.id,
              slug: recipe.slug,
              title: recipe.title,
              coverImageUrl: recipe.coverImageUrl,
            }
          : null,
        text: review.title ?? review.body,
        photoUrl: null,
        rating: review.rating,
      });
    }

    // 4) Comments + suggestions on group recipes.
    const commentRows = await db.query.comments.findMany({
      where: and(
        inArray(comments.recipeId, recipeIds),
        isNull(comments.hiddenAt),
        beforeFilter(comments.createdAt),
      ),
      orderBy: [desc(comments.createdAt)],
      limit,
      columns: {
        id: true,
        kind: true,
        body: true,
        recipeId: true,
        userId: true,
        createdAt: true,
      },
      with: {
        user: {
          columns: { id: true, name: true, handle: true, avatarUrl: true },
        },
      },
    });
    for (const comment of commentRows) {
      if (comment.userId && hidden.has(comment.userId)) continue;
      const recipe = recipeById.get(comment.recipeId);
      events.push({
        id: `comment:${comment.id}`,
        kind: comment.kind === "suggestion" ? "suggestion" : "comment",
        at: comment.createdAt,
        actor: comment.user ?? null,
        recipe: recipe
          ? {
              id: recipe.id,
              slug: recipe.slug,
              title: recipe.title,
              coverImageUrl: recipe.coverImageUrl,
            }
          : null,
        text: comment.body,
        photoUrl: null,
        rating: null,
      });
    }
  }

  // 5) New members joining.
  const joins = await db.query.groupMembers.findMany({
    where: and(
      eq(groupMembers.groupId, groupId),
      beforeFilter(groupMembers.createdAt),
    ),
    orderBy: [desc(groupMembers.createdAt)],
    limit,
    columns: { id: true, userId: true, createdAt: true },
    with: {
      user: { columns: { id: true, name: true, handle: true, avatarUrl: true } },
    },
  });
  for (const join of joins) {
    events.push({
      id: `member:${join.id}`,
      kind: "member_joined",
      at: join.createdAt,
      actor: join.user ?? null,
      recipe: null,
      text: null,
      photoUrl: null,
      rating: null,
    });
  }

  // Merge + sort newest-first, then take the page.
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  const page = events.slice(0, limit);
  const nextCursor =
    events.length > limit && page.length > 0
      ? page[page.length - 1]!.at.toISOString()
      : null;

  return { events: page, nextCursor };
}
