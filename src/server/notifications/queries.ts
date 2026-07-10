import "server-only";

import type { Route } from "next";
import { and, desc, eq, isNull, lt } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { notifications, type NotificationType } from "~/server/db/schema";
import { filterBlocked, getHiddenAuthorIds } from "~/server/moderation/blocks";

/** One notification shaped for the bell dropdown / inbox. */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  context: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
  /** Deep link to the source of the event, or null if it no longer resolves. */
  href: Route | null;
};

/** A page of notifications plus the cursor to fetch the next page. */
export type NotificationPage = {
  items: NotificationItem[];
  nextCursor: string | null;
};

/**
 * The number of unread notifications, for the header bell badge. Notifications
 * from a blocked actor (or someone who blocked the viewer) are excluded so the
 * badge count matches the filtered list (#355). System notifications (null
 * actor) always count.
 */
export async function getUnreadCount(userId: string | null): Promise<number> {
  if (!isDbConfigured() || !userId) return 0;
  const hiddenAuthorIds = await getHiddenAuthorIds(userId);
  const rows = await db
    .select({ id: notifications.id, actorId: notifications.actorId })
    .from(notifications)
    .where(
      and(eq(notifications.recipientId, userId), isNull(notifications.readAt)),
    );
  return filterBlocked(rows, (row) => row.actorId, hiddenAuthorIds).length;
}

/**
 * Resolve a deep link for a notification from whichever target it carries. A
 * recipe target wins over a group target; system events with neither resolve to
 * null and render as a non-clickable row.
 */
function hrefFor(row: {
  recipe: { slug: string } | null;
  group: { slug: string } | null;
}): Route | null {
  if (row.recipe) return `/recipes/${row.recipe.slug}` as Route;
  if (row.group) return `/groups/${row.group.slug}` as Route;
  return null;
}

/**
 * Recent notifications for a user, newest first, with cursor pagination keyed on
 * `createdAt` (encoded as an ISO string). Joins the actor + recipe/group targets
 * so the row can render an avatar and deep-link without extra round-trips.
 * Notifications whose actor the viewer has blocked (or who has blocked them) are
 * dropped from the page — the single read-side chokepoint (#355), so every
 * notification type (mentions, replies, reviews, cook-along invites, reports)
 * respects blocks regardless of which write path created it, and retroactively.
 * Pagination keys off the raw fetched rows so filtering never skips a page.
 */
export async function listNotifications(
  userId: string | null,
  {
    limit = 20,
    cursor = null,
  }: { limit?: number; cursor?: string | null } = {},
): Promise<NotificationPage> {
  if (!isDbConfigured() || !userId) return { items: [], nextCursor: null };

  const hiddenAuthorIds = await getHiddenAuthorIds(userId);
  const cursorDate = cursor ? new Date(cursor) : null;
  const rows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientId, userId),
      cursorDate && !Number.isNaN(cursorDate.getTime())
        ? lt(notifications.createdAt, cursorDate)
        : undefined,
    ),
    orderBy: [desc(notifications.createdAt)],
    limit: limit + 1,
    with: {
      actor: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
      recipe: { columns: { slug: true } },
      group: { columns: { slug: true } },
    },
  });

  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null;

  const visible = filterBlocked(page, (row) => row.actorId, hiddenAuthorIds);

  return {
    items: visible.map((row) => ({
      id: row.id,
      type: row.type,
      context: row.context,
      readAt: row.readAt,
      createdAt: row.createdAt,
      actor: row.actor
        ? {
            id: row.actor.id,
            name: row.actor.name,
            handle: row.actor.handle,
            avatarUrl: row.actor.avatarUrl,
          }
        : null,
      href: hrefFor(row),
    })),
    nextCursor,
  };
}
