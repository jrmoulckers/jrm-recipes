import 'server-only';

import { and, desc, eq, inArray, isNull, lt, type Column } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { getHiddenAuthorIds } from '~/server/moderation/blocks';
import { cookLogEntries, follows, recipes, reviews, users } from '~/server/db/schema';
import type { ActivityEvent, ActivityPage } from '~/server/activity/queries';

/** A cook shaped for a followers / following list row. */
export type FollowPerson = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  followedAt: Date;
};

export type FollowList = {
  people: FollowPerson[];
  /** ISO timestamp to pass as `before` for the next page, or null at the end. */
  nextCursor: string | null;
};

const DEFAULT_LIMIT = 20;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), 50);
}

/** Is `followerId` currently following `followeeId`? */
export async function isFollowing(
  followerId: string | null | undefined,
  followeeId: string,
): Promise<boolean> {
  if (!isDbConfigured() || !followerId || followerId === followeeId) {
    return false;
  }
  const row = await db.query.follows.findFirst({
    where: and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)),
    columns: { id: true },
  });
  return Boolean(row);
}

/** Follower / following counts for a user's public profile. */
export async function getFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  if (!isDbConfigured()) return { followers: 0, following: 0 };
  const [followerRows, followingRows] = await Promise.all([
    db.query.follows.findMany({
      where: eq(follows.followeeId, userId),
      columns: { id: true },
    }),
    db.query.follows.findMany({
      where: eq(follows.followerId, userId),
      columns: { id: true },
    }),
  ]);
  return { followers: followerRows.length, following: followingRows.length };
}

type PersonColumns = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
};

function toFollowPerson(
  person: PersonColumns | null | undefined,
  followedAt: Date,
): FollowPerson | null {
  if (!person) return null;
  return {
    id: person.id,
    name: person.name,
    handle: person.handle,
    avatarUrl: person.avatarUrl,
    followedAt,
  };
}

function paginate<T>(
  rows: { createdAt: Date }[],
  people: (T | null)[],
  limit: number,
): { people: T[]; nextCursor: string | null } {
  const kept = people.slice(0, limit).filter((p): p is T => p !== null);
  const hasMore = rows.length > limit;
  const nextCursor =
    hasMore && rows.length > 0
      ? rows[Math.min(limit, rows.length) - 1]!.createdAt.toISOString()
      : null;
  return { people: kept, nextCursor };
}

/** People who follow `userId` (most recent first), paginated. */
export async function listFollowers(
  userId: string,
  opts: { limit?: number; before?: Date | null } = {},
): Promise<FollowList> {
  if (!isDbConfigured()) return { people: [], nextCursor: null };
  const limit = clampLimit(opts.limit);
  const before = opts.before ?? null;

  const rows = await db.query.follows.findMany({
    where: before
      ? and(eq(follows.followeeId, userId), lt(follows.createdAt, before))
      : eq(follows.followeeId, userId),
    orderBy: [desc(follows.createdAt)],
    limit: limit + 1,
    with: {
      follower: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });

  const people = rows.map((row) => toFollowPerson(row.follower, row.createdAt));
  return paginate(rows, people, limit);
}

/** People `userId` follows (most recent first), paginated. */
export async function listFollowing(
  userId: string,
  opts: { limit?: number; before?: Date | null } = {},
): Promise<FollowList> {
  if (!isDbConfigured()) return { people: [], nextCursor: null };
  const limit = clampLimit(opts.limit);
  const before = opts.before ?? null;

  const rows = await db.query.follows.findMany({
    where: before
      ? and(eq(follows.followerId, userId), lt(follows.createdAt, before))
      : eq(follows.followerId, userId),
    orderBy: [desc(follows.createdAt)],
    limit: limit + 1,
    with: {
      followee: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
    },
  });

  const people = rows.map((row) => toFollowPerson(row.followee, row.createdAt));
  return paginate(rows, people, limit);
}

/**
 * The following feed: a reverse-chronological union of the *public* activity of
 * everyone `userId` follows. This is the privacy firewall of the whole feature.
 * it can ONLY ever surface public content:
 *
 * - public + published (non-deleted) recipes authored by a followee.
 * - reviews by a followee on a public + published recipe.
 * - cook-log entries by a followee that are NOT shared to any group
 *   (`sharedToGroupId IS NULL`) and whose recipe is public + published.
 *
 * Group/family-private content is unreachable here: group-visibility recipes are
 * filtered out, and any cook shared to a group is excluded outright. Followees
 * who have since opted out ({@link users.publicActivityOptIn} = false) contribute
 * nothing, and blocks (either direction) drop the followee entirely.
 */
export async function getFollowingActivity(
  userId: string,
  opts: { limit?: number; before?: Date | null } = {},
): Promise<ActivityPage> {
  if (!isDbConfigured()) return { events: [], nextCursor: null };

  const followRows = await db.query.follows.findMany({
    where: eq(follows.followerId, userId),
    columns: { followeeId: true },
  });
  const followeeIds = [...new Set(followRows.map((r) => r.followeeId))];
  if (followeeIds.length === 0) return { events: [], nextCursor: null };

  // Re-check the opt-in at read time so opting out immediately stops
  // contributing, and drop anyone involved in a block (symmetric).
  const [optedInRows, hidden] = await Promise.all([
    db.query.users.findMany({
      where: and(
        inArray(users.id, followeeIds),
        eq(users.publicActivityOptIn, true),
        isNull(users.deletedAt),
      ),
      columns: { id: true },
    }),
    getHiddenAuthorIds(userId),
  ]);
  const authorIds = optedInRows.map((u) => u.id).filter((id) => !hidden.has(id));
  if (authorIds.length === 0) return { events: [], nextCursor: null };

  return collectPublicActivity(authorIds, opts);
}

/** True only for a live, publicly-published recipe. The one visibility gate. */
function isPublicRecipe(
  recipe:
    | {
        visibility: string;
        status: string;
        deletedAt: Date | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(
    recipe?.visibility === 'public' && recipe.status === 'published' && recipe.deletedAt === null,
  );
}

/**
 * Collect the public activity of `authorIds`, newest-first, with cursor
 * pagination. Every branch filters strictly to public content. This function
 * is deliberately the only place the following feed reads activity, so there is
 * a single, auditable public boundary.
 */
async function collectPublicActivity(
  authorIds: string[],
  opts: { limit?: number; before?: Date | null },
): Promise<ActivityPage> {
  const limit = clampLimit(opts.limit);
  if (authorIds.length === 0) return { events: [], nextCursor: null };

  const before = opts.before ?? null;
  const beforeFilter = (column: Column) => (before ? lt(column, before) : undefined);

  const events: ActivityEvent[] = [];

  // 1) Public, published recipes authored by a followee.
  const authoredRecipes = await db.query.recipes.findMany({
    where: and(
      inArray(recipes.authorId, authorIds),
      eq(recipes.visibility, 'public'),
      eq(recipes.status, 'published'),
      isNull(recipes.deletedAt),
      beforeFilter(recipes.createdAt),
    ),
    orderBy: [desc(recipes.createdAt)],
    limit,
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
  for (const recipe of authoredRecipes) {
    events.push({
      id: `recipe:${recipe.id}`,
      kind: 'recipe_added',
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

  // 2) Reviews by a followee. Kept only when the reviewed recipe is public.
  const reviewRows = await db.query.reviews.findMany({
    where: and(
      inArray(reviews.userId, authorIds),
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
      createdAt: true,
    },
    with: {
      user: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
      recipe: {
        columns: {
          id: true,
          slug: true,
          title: true,
          coverImageUrl: true,
          visibility: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });
  for (const review of reviewRows) {
    if (!isPublicRecipe(review.recipe)) continue;
    events.push({
      id: `review:${review.id}`,
      kind: 'review',
      at: review.createdAt,
      actor: review.user ?? null,
      recipe: {
        id: review.recipe.id,
        slug: review.recipe.slug,
        title: review.recipe.title,
        coverImageUrl: review.recipe.coverImageUrl,
      },
      text: review.title ?? review.body,
      photoUrl: null,
      rating: review.rating,
    });
  }

  // 3) Cook-log entries by a followee. Only NON-group-shared cooks on a public
  //    recipe. Any cook shared to a group is family-private and excluded here.
  const cookRows = await db.query.cookLogEntries.findMany({
    where: and(
      inArray(cookLogEntries.userId, authorIds),
      isNull(cookLogEntries.sharedToGroupId),
      isNull(cookLogEntries.hiddenAt),
      beforeFilter(cookLogEntries.createdAt),
    ),
    orderBy: [desc(cookLogEntries.createdAt)],
    limit,
    columns: {
      id: true,
      note: true,
      photoUrl: true,
      createdAt: true,
    },
    with: {
      user: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
      recipe: {
        columns: {
          id: true,
          slug: true,
          title: true,
          coverImageUrl: true,
          visibility: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });
  for (const cook of cookRows) {
    if (!isPublicRecipe(cook.recipe)) continue;
    events.push({
      id: `cook:${cook.id}`,
      kind: 'cook_shared',
      at: cook.createdAt,
      actor: cook.user ?? null,
      recipe: {
        id: cook.recipe.id,
        slug: cook.recipe.slug,
        title: cook.recipe.title,
        coverImageUrl: cook.recipe.coverImageUrl,
      },
      text: cook.note,
      photoUrl: cook.photoUrl,
      rating: null,
    });
  }

  // Merge + sort newest-first, then take the page.
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  const page = events.slice(0, limit);
  const nextCursor =
    events.length > limit && page.length > 0 ? page[page.length - 1]!.at.toISOString() : null;

  return { events: page, nextCursor };
}
