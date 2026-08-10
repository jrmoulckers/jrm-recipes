'use server';

import { getCurrentUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { getMembership } from '~/server/groups/queries';
import { ok, type ActionResult } from '~/server/action-result';
import { getGroupActivity, getPersonalActivity, type ActivityPage } from './queries';

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

/**
 * Load-more for the personal home feed. Re-resolves the caller's group
 * memberships on every call (inside {@link getPersonalActivity}) so the cursor
 * can only ever page the viewer's own groups. A cursor can't leak activity
 * from a group they've since left or never belonged to. Empty for signed-out
 * callers and users with no groups.
 */
export async function loadPersonalActivityAction(input: {
  before?: string | null;
}): Promise<ActionResult<ActivityPage>> {
  if (!isDbConfigured()) return ok(EMPTY);
  const user = await getCurrentUser();
  if (!user) return ok(EMPTY);

  const before = input.before ? new Date(input.before) : null;
  const page = await getPersonalActivity(user.id, {
    before: before && !Number.isNaN(before.getTime()) ? before : null,
  });
  return ok(page);
}
