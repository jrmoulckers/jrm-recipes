import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '~/server/db';
import { users, type User } from '~/server/db/schema';
import { mediaUrl } from '~/server/media/validation';

/**
 * Profile mutations (issue #659, epic #655).
 *
 * Authorization lives here rather than in the action wrapper, matching
 * `~/server/media/mutations`: every write is scoped to the passed-in `user.id`,
 * so a caller can only ever change their own row.
 */

/**
 * The avatar a user picked inside Heirloom. Empty means "clear it", which also
 * hands ownership of the column back to Clerk.
 */
export const avatarInput = z.object({
  url: mediaUrl.optional().or(z.literal('').transform(() => undefined)),
});

export type AvatarInput = z.infer<typeof avatarInput>;

/**
 * Set (or clear) the signed-in user's avatar.
 *
 * `avatarUserManaged` is the signal `applyClerkUserUpdate` reads: while it is
 * true the Clerk `user.updated` sync leaves `avatarUrl` alone, so a photo chosen
 * here survives every later identity-provider change. Clearing the photo turns
 * it back off, which is how a user asks for their Clerk picture back.
 */
export async function updateAvatar(
  input: AvatarInput,
  user: User,
): Promise<{ avatarUrl: string | null }> {
  const url = input.url ?? null;
  await db
    .update(users)
    .set({ avatarUrl: url, avatarUserManaged: url != null })
    .where(eq(users.id, user.id));
  return { avatarUrl: url };
}
