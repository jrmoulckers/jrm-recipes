import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import { DomainError } from "~/server/errors";
import { canViewRecipe } from "~/server/recipes/queries";
import { assertKidAllowed } from "~/server/groups/kid-safe";
import { notifyMany } from "~/server/notifications/notify";
import {
  contentReports,
  groupMembers,
  type User,
} from "~/server/db/schema";
import type { ReportContentInput } from "./validation";
import { resolveTarget } from "./targets";

/**
 * File a report against a comment / review / cook-log post (issue #356).
 *
 * - The reporter must be able to view the underlying recipe (same gate as
 *   commenting), and — if it's a group recipe — the kid role can't report
 *   (`moderate_content` is an adult-facing safety tool, #345).
 * - De-duped by the `(targetType, targetId, reporterId)` unique constraint, so a
 *   repeat report by the same person is a no-op rather than an inflated count.
 * - The group's owners/admins are notified so the moderation queue (#357) gets a
 *   signal. Reporter identity is never surfaced to other members.
 *
 * Returns whether a NEW report was created (false = duplicate) so the action can
 * still show the reporter a friendly confirmation either way.
 */
export async function reportContent(
  input: ReportContentInput,
  user: User,
): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    const target = await resolveTarget(tx, input.targetType, input.targetId);
    if (!target) throw new DomainError("NOT_FOUND");
    if (!(await canViewRecipe(target.recipe, user))) {
      throw new DomainError("FORBIDDEN");
    }
    // You can't report your own content — that's a delete, not a report.
    if (target.authorId === user.id) throw new DomainError("FORBIDDEN");

    const groupId = target.recipe.groupId;
    let ownerAdminIds: string[] = [];
    if (groupId) {
      const members = await tx.query.groupMembers.findMany({
        where: eq(groupMembers.groupId, groupId),
        columns: { userId: true, role: true },
      });
      const reporterRole = members.find((m) => m.userId === user.id)?.role;
      assertKidAllowed(reporterRole, "moderate_content");
      ownerAdminIds = members
        .filter((m) => m.role === "owner" || m.role === "admin")
        .map((m) => m.userId);
    }

    const [row] = await tx
      .insert(contentReports)
      .values({
        targetType: input.targetType,
        targetId: input.targetId,
        reporterId: user.id,
        groupId: groupId ?? null,
        reason: input.reason,
        detail: input.detail ?? null,
      })
      .onConflictDoNothing({
        target: [
          contentReports.targetType,
          contentReports.targetId,
          contentReports.reporterId,
        ],
      })
      .returning({ id: contentReports.id });

    // A duplicate report short-circuits the conflict clause -> no row returned.
    const created = Boolean(row);

    if (created && ownerAdminIds.length > 0) {
      await notifyMany(tx, ownerAdminIds, {
        actorId: user.id,
        type: "report",
        recipeId: target.recipeId,
        groupId,
        entityId: input.targetId,
        context: target.preview.slice(0, 120),
      });
    }

    return { created };
  });
}

/** Count of standing (open) reports per target for a set of targets (#357). */
export async function countOpenReports(
  targetType: ReportContentInput["targetType"],
  targetIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (targetIds.length === 0) return counts;
  const rows = await db.query.contentReports.findMany({
    where: and(
      eq(contentReports.targetType, targetType),
      inArray(contentReports.targetId, targetIds),
      eq(contentReports.status, "open"),
    ),
    columns: { targetId: true },
  });
  for (const row of rows) {
    counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + 1);
  }
  return counts;
}
