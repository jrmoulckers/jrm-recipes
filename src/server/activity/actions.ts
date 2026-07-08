"use server";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { getMembership } from "~/server/groups/queries";
import { ok, type ActionResult } from "~/server/action-result";
import { getGroupActivity, type ActivityPage } from "./queries";

const EMPTY: ActivityPage = { events: [], nextCursor: null };

/**
 * Load-more for the family activity feed (issue #349). Re-checks membership on
 * every call so the cursor can't be used to page a group the caller can't see.
 * Returns an empty page for non-members / signed-out callers.
 */
export async function loadGroupActivityAction(input: {
  groupId: string;
  before?: string | null;
}): Promise<ActionResult<ActivityPage>> {
  if (!isDbConfigured()) return ok(EMPTY);
  const user = await getCurrentUser();
  if (!user) return ok(EMPTY);

  const membership = await getMembership(input.groupId, user.id);
  if (!membership) return ok(EMPTY);

  const before = input.before ? new Date(input.before) : null;
  const page = await getGroupActivity(
    input.groupId,
    { id: user.id, role: membership.role },
    { before: before && !Number.isNaN(before.getTime()) ? before : null },
  );
  return ok(page);
}
