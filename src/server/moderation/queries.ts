import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import { DomainError } from "~/server/errors";
import { canManage } from "~/server/groups/queries";
import {
  contentReports,
  groupMembers,
  groups,
  users,
  type MemberRole,
  type ModerationTarget,
  type ReportReason,
  type User,
} from "~/server/db/schema";
import { resolveTarget } from "./targets";

/** One aggregated item in a group's moderation queue (issue #357). */
export type ModerationQueueItem = {
  targetType: ModerationTarget;
  targetId: string;
  preview: string;
  reportCount: number;
  reasons: ReportReason[];
  hidden: boolean;
  latestReportAt: Date;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
  } | null;
};

export type ModerationQueue = {
  groupId: string;
  groupSlug: string;
  items: ModerationQueueItem[];
};

/**
 * The moderation queue for a group (issue #357): open reports aggregated by
 * target, newest first. Owner/admin only — members and kids get a FORBIDDEN so
 * the page can 404/redirect. Each item carries the reported content preview, the
 * distinct reasons, a report count, and whether it's already hidden.
 */
export async function getModerationQueue(
  groupSlug: string,
  viewer: User | null,
): Promise<ModerationQueue | null> {
  if (!isDbConfigured() || !viewer) return null;

  const group = await db.query.groups.findFirst({
    where: eq(groups.slug, groupSlug),
    columns: { id: true, slug: true },
  });
  if (!group) return null;

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, group.id),
      eq(groupMembers.userId, viewer.id),
    ),
    columns: { role: true },
  });
  if (!canManage(membership?.role)) throw new DomainError("FORBIDDEN");

  const reports = await db.query.contentReports.findMany({
    where: and(
      eq(contentReports.groupId, group.id),
      eq(contentReports.status, "open"),
    ),
    orderBy: [desc(contentReports.createdAt)],
    columns: {
      targetType: true,
      targetId: true,
      reason: true,
      createdAt: true,
    },
  });

  // Aggregate by (targetType, targetId).
  type Agg = {
    targetType: ModerationTarget;
    targetId: string;
    reasons: Set<ReportReason>;
    count: number;
    latestReportAt: Date;
  };
  const byTarget = new Map<string, Agg>();
  for (const report of reports) {
    const key = `${report.targetType}:${report.targetId}`;
    const existing = byTarget.get(key);
    if (existing) {
      existing.count += 1;
      existing.reasons.add(report.reason);
      if (report.createdAt > existing.latestReportAt) {
        existing.latestReportAt = report.createdAt;
      }
    } else {
      byTarget.set(key, {
        targetType: report.targetType,
        targetId: report.targetId,
        reasons: new Set([report.reason]),
        count: 1,
        latestReportAt: report.createdAt,
      });
    }
  }

  // Resolve each target's content preview + author. Drop targets that no longer
  // exist (deleted content) — nothing left to moderate.
  const items: ModerationQueueItem[] = [];
  const authorIds = new Set<string>();
  const resolved = await Promise.all(
    [...byTarget.values()].map(async (agg) => ({
      agg,
      target: await resolveTarget(db, agg.targetType, agg.targetId),
    })),
  );
  for (const { target } of resolved) {
    if (target) authorIds.add(target.authorId);
  }
  const authorRows =
    authorIds.size > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, [...authorIds]),
          columns: { id: true, name: true, handle: true },
        })
      : [];
  const authorById = new Map(authorRows.map((a) => [a.id, a]));

  for (const { agg, target } of resolved) {
    if (!target) continue;
    items.push({
      targetType: agg.targetType,
      targetId: agg.targetId,
      preview: target.preview,
      reportCount: agg.count,
      reasons: [...agg.reasons],
      hidden: target.hiddenAt != null,
      latestReportAt: agg.latestReportAt,
      author: authorById.get(target.authorId) ?? null,
    });
  }

  items.sort((a, b) => b.latestReportAt.getTime() - a.latestReportAt.getTime());

  return { groupId: group.id, groupSlug: group.slug, items };
}

/** Count of open reports for a group — for a moderation badge on the group nav. */
export async function getOpenReportCount(
  groupId: string,
  viewerRole: MemberRole | null | undefined,
): Promise<number> {
  if (!isDbConfigured() || !canManage(viewerRole)) return 0;
  const rows = await db.query.contentReports.findMany({
    where: and(
      eq(contentReports.groupId, groupId),
      eq(contentReports.status, "open"),
    ),
    columns: { id: true },
  });
  return rows.length;
}
