import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { DomainError } from "~/server/errors";
import { canManage } from "~/server/groups/queries";
import {
  comments,
  contentReports,
  cookLogEntries,
  groupMembers,
  groups,
  reviews,
  type ModerationTarget,
  type User,
} from "~/server/db/schema";
import type { DismissReportInput, HideContentInput } from "./validation";
import { resolveTarget } from "./targets";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Gate: the actor must be an owner/admin of the group at `groupSlug`. */
async function requireManager(tx: Tx, groupSlug: string, user: User) {
  const group = await tx.query.groups.findFirst({
    where: eq(groups.slug, groupSlug),
    columns: { id: true },
  });
  if (!group) throw new DomainError("NOT_FOUND");
  const membership = await tx.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, group.id),
      eq(groupMembers.userId, user.id),
    ),
    columns: { role: true },
  });
  if (!canManage(membership?.role)) throw new DomainError("FORBIDDEN");
  return group;
}

async function setHidden(
  tx: Tx,
  targetType: ModerationTarget,
  targetId: string,
  hiddenBy: string | null,
) {
  const now = hiddenBy ? new Date() : null;
  if (targetType === "comment") {
    await tx
      .update(comments)
      .set({ hiddenAt: now, hiddenBy })
      .where(eq(comments.id, targetId));
  } else if (targetType === "review") {
    await tx
      .update(reviews)
      .set({ hiddenAt: now, hiddenBy })
      .where(eq(reviews.id, targetId));
  } else {
    await tx
      .update(cookLogEntries)
      .set({ hiddenAt: now, hiddenBy })
      .where(eq(cookLogEntries.id, targetId));
  }
}

/**
 * Hide reported content from member (and always kid) views (issue #357). Sets
 * `hiddenAt`/`hiddenBy` on the target row and resolves its open reports. The
 * target must belong to the moderator's group. Owner/admin only.
 */
export async function hideContent(
  input: HideContentInput,
  user: User,
): Promise<void> {
  await db.transaction(async (tx) => {
    const group = await requireManager(tx, input.groupSlug, user);
    const target = await resolveTarget(tx, input.targetType, input.targetId);
    if (!target) throw new DomainError("NOT_FOUND");
    if (target.recipe.groupId !== group.id) throw new DomainError("FORBIDDEN");

    await setHidden(tx, input.targetType, input.targetId, user.id);
    await resolveReportsForTarget(tx, input.targetType, input.targetId, user.id);
  });
}

/**
 * Dismiss the open reports on a target without hiding it (issue #357): the
 * content is fine, the report is closed. Owner/admin only.
 */
export async function dismissReport(
  input: DismissReportInput,
  user: User,
): Promise<void> {
  await db.transaction(async (tx) => {
    const group = await requireManager(tx, input.groupSlug, user);
    await tx
      .update(contentReports)
      .set({
        status: "dismissed",
        resolvedById: user.id,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(contentReports.groupId, group.id),
          eq(contentReports.targetType, input.targetType),
          eq(contentReports.targetId, input.targetId),
          eq(contentReports.status, "open"),
        ),
      );
  });
}

/** Mark every open report on a target as resolved (used when hiding). */
async function resolveReportsForTarget(
  tx: Tx,
  targetType: ModerationTarget,
  targetId: string,
  resolvedById: string,
) {
  await tx
    .update(contentReports)
    .set({
      status: "resolved",
      resolvedById,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(contentReports.targetType, targetType),
        eq(contentReports.targetId, targetId),
        eq(contentReports.status, "open"),
      ),
    );
}
