import { z } from 'zod';

/**
 * Validation for the public follow graph. The client Follow button and the
 * server actions share these shapes so the ids match end to end.
 */

const idInput = z.string().trim().min(1);

export const followUserInput = z.object({
  followeeId: idInput,
});

export const unfollowUserInput = z.object({
  followeeId: idInput,
});

export type FollowUserInput = z.infer<typeof followUserInput>;
export type UnfollowUserInput = z.infer<typeof unfollowUserInput>;
