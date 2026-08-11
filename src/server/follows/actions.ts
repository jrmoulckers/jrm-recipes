'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { captureServer } from '~/lib/analytics/server';
import { getCurrentUser, requireUser } from '~/server/auth';
import { db, isDbConfigured } from '~/server/db';
import { users } from '~/server/db/schema';
import { type ActionResult, fail, fromZodError, ok } from '~/server/action-result';
import { messageForError } from '~/server/errors';
import type { ActivityPage } from '~/server/activity/queries';
import { followUserInput, unfollowUserInput } from './validation';
import { followUser, unfollowUser } from './mutations';
import { getFollowingActivity, listFollowers, listFollowing, type FollowList } from './queries';

const EMPTY: ActivityPage = { events: [], nextCursor: null };
const EMPTY_LIST: FollowList = { people: [], nextCursor: null };

function dbGuard(): ActionResult | null {
  return isDbConfigured() ? null : { ok: false, error: 'That needs a database connection.' };
}

/** Follow another cook (opt-in public graph). */
export async function followUserAction(input: { followeeId: string }): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = followUserInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await followUser(user.id, parsed.data.followeeId);
    void captureServer(user.id, 'followed_cook', {
      followeeId: parsed.data.followeeId,
    });
    revalidatePath(`/cooks`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "You can't follow this cook.",
          USER_NOT_FOUND: "That cook isn't available to follow.",
        },
        "We couldn't follow that cook.",
      ),
    );
  }
}

/** Stop following a cook. */
export async function unfollowUserAction(input: { followeeId: string }): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = unfollowUserInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await unfollowUser(user.id, parsed.data.followeeId);
    void captureServer(user.id, 'unfollowed_cook', {
      followeeId: parsed.data.followeeId,
    });
    revalidatePath(`/cooks`);
    return ok();
  } catch {
    return fail("We couldn't unfollow that cook.");
  }
}

/**
 * Toggle the signed-in user's public-activity opt-in. Off by default. Turning it
 * on makes them discoverable/followable and lets their public activity surface
 * in followers' feeds. Turning it off is honored at read time immediately.
 */
export async function setPublicActivityOptInAction(optedIn: boolean): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;

  const user = await requireUser();
  try {
    await db.update(users).set({ publicActivityOptIn: optedIn }).where(eq(users.id, user.id));
    void captureServer(user.id, 'public_activity_opt_in_changed', { optedIn });
    revalidatePath('/settings/following');
    return ok();
  } catch {
    return fail("We couldn't update your preference. Please try again.");
  }
}

/**
 * Load-more for the following feed. Re-resolves the caller's follows on every
 * call (inside {@link getFollowingActivity}), so a cursor can only ever page
 * public activity from cooks they currently follow who are still opted in.
 */
export async function loadFollowingActivityAction(input: {
  before?: string | null;
}): Promise<ActionResult<ActivityPage>> {
  if (!isDbConfigured()) return ok(EMPTY);
  const user = await getCurrentUser();
  if (!user) return ok(EMPTY);

  const before = input.before ? new Date(input.before) : null;
  const page = await getFollowingActivity(user.id, {
    before: before && !Number.isNaN(before.getTime()) ? before : null,
  });
  return ok(page);
}

/** True only when `userId` is a real, opted-in (non-deleted) account. */
async function isPublicProfile(userId: string): Promise<boolean> {
  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { publicActivityOptIn: true, deletedAt: true },
  });
  return Boolean(target && target.publicActivityOptIn && !target.deletedAt);
}

/**
 * Page a cook's followers. Only ever enumerable for opted-in profiles, so the
 * follow graph of a cook who hasn't opted in is never exposed.
 */
export async function loadFollowersAction(input: {
  userId: string;
  before?: string | null;
}): Promise<ActionResult<FollowList>> {
  if (!isDbConfigured()) return ok(EMPTY_LIST);
  if (!input.userId || !(await isPublicProfile(input.userId))) {
    return ok(EMPTY_LIST);
  }
  const before = input.before ? new Date(input.before) : null;
  const page = await listFollowers(input.userId, {
    before: before && !Number.isNaN(before.getTime()) ? before : null,
  });
  return ok(page);
}

/** Page a cook's following list. Gated on opt-in exactly like followers. */
export async function loadFollowingAction(input: {
  userId: string;
  before?: string | null;
}): Promise<ActionResult<FollowList>> {
  if (!isDbConfigured()) return ok(EMPTY_LIST);
  if (!input.userId || !(await isPublicProfile(input.userId))) {
    return ok(EMPTY_LIST);
  }
  const before = input.before ? new Date(input.before) : null;
  const page = await listFollowing(input.userId, {
    before: before && !Number.isNaN(before.getTime()) ? before : null,
  });
  return ok(page);
}
