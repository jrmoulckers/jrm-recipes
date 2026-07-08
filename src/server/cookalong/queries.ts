import "server-only";

import { and, asc, desc, eq, gte, lt } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { cookAlongs, groupMembers } from "~/server/db/schema";
import type { RsvpStatus } from "~/server/db/schema";

export type CookAlongAttendee = {
  userId: string;
  status: RsvpStatus;
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
};

export type UpcomingCookAlong = {
  id: string;
  title: string | null;
  note: string | null;
  scheduledFor: Date;
  recipe: { id: string; slug: string; title: string } | null;
  host: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
  attendees: CookAlongAttendee[];
  goingCount: number;
  /** The viewer's own RSVP, or null if they haven't responded. */
  viewerStatus: RsvpStatus | null;
};

/**
 * Upcoming cook-alongs for a group (issue #353): everything scheduled from
 * `now` onward, soonest first, with host, recipe, and attendee RSVPs. Returns
 * `[]` for non-members so the schedule never leaks outside the family. The
 * viewer's own RSVP is surfaced so the UI can highlight their response.
 */
export async function getUpcomingCookAlongs(
  groupId: string,
  viewerId: string | null,
  { limit = 10, now = new Date() }: { limit?: number; now?: Date } = {},
): Promise<UpcomingCookAlong[]> {
  if (!isDbConfigured() || !viewerId) return [];

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, viewerId),
    ),
    columns: { id: true },
  });
  if (!membership) return [];

  const rows = await db.query.cookAlongs.findMany({
    where: and(
      eq(cookAlongs.groupId, groupId),
      gte(cookAlongs.scheduledFor, now),
    ),
    orderBy: [asc(cookAlongs.scheduledFor)],
    limit,
    columns: {
      id: true,
      title: true,
      note: true,
      scheduledFor: true,
    },
    with: {
      recipe: { columns: { id: true, slug: true, title: true } },
      host: {
        columns: { id: true, name: true, handle: true, avatarUrl: true },
      },
      rsvps: {
        columns: { userId: true, status: true },
        with: {
          user: {
            columns: { id: true, name: true, handle: true, avatarUrl: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const attendees: CookAlongAttendee[] = row.rsvps.map((rsvp) => ({
      userId: rsvp.userId,
      status: rsvp.status,
      user: rsvp.user ?? null,
    }));
    return {
      id: row.id,
      title: row.title,
      note: row.note,
      scheduledFor: row.scheduledFor,
      recipe: row.recipe ?? null,
      host: row.host ?? null,
      attendees,
      goingCount: attendees.filter((a) => a.status === "going").length,
      viewerStatus:
        attendees.find((a) => a.userId === viewerId)?.status ?? null,
    };
  });
}

export type PastCookAlongPrompt = {
  id: string;
  title: string | null;
  scheduledFor: Date;
  recipe: { id: string; slug: string; title: string } | null;
};

/**
 * Recently-finished cook-alongs the viewer said they'd attend (issue #353), so
 * the group page can nudge them to log the cook + rate afterward. Bounded to the
 * last few days and to events the viewer RSVP'd going/maybe.
 */
export async function getRecentCookAlongsToLog(
  groupId: string,
  viewerId: string | null,
  { withinMs = 3 * 24 * 60 * 60 * 1000, now = new Date() } = {},
): Promise<PastCookAlongPrompt[]> {
  if (!isDbConfigured() || !viewerId) return [];
  const since = new Date(now.getTime() - withinMs);

  const rows = await db.query.cookAlongs.findMany({
    where: and(
      eq(cookAlongs.groupId, groupId),
      lt(cookAlongs.scheduledFor, now),
      gte(cookAlongs.scheduledFor, since),
    ),
    orderBy: [desc(cookAlongs.scheduledFor)],
    limit: 5,
    columns: { id: true, title: true, scheduledFor: true },
    with: {
      recipe: { columns: { id: true, slug: true, title: true } },
      rsvps: { columns: { userId: true, status: true } },
    },
  });

  return rows
    .filter((row) =>
      row.rsvps.some(
        (r) =>
          r.userId === viewerId &&
          (r.status === "going" || r.status === "maybe"),
      ),
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      scheduledFor: row.scheduledFor,
      recipe: row.recipe ?? null,
    }));
}
