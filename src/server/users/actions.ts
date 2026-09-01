'use server';

import { revalidatePath } from 'next/cache';

import { log } from '~/lib/log';
import { requireUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { eraseUserAccount } from '~/server/users/erasure';
import { avatarInput, updateAvatar } from '~/server/users/mutations';
import { DELETION_CONFIRM_PHRASE, DELETION_NOTICE_VERSION } from '~/server/users/deletion-notice';

export type DeleteAccountResult = { ok: true } | { ok: false; error: string; code?: string };

export type UpdateAvatarResult =
  { ok: true; avatarUrl: string | null } | { ok: false; error: string };

const NO_DB = 'Account deletion needs a database. Set DATABASE_URL (see .env.example).';

function messageFor(error: unknown): { error: string; code?: string } {
  const code = error instanceof Error ? error.message : '';
  if (code.startsWith('MEDIA_PURGE_INCOMPLETE')) {
    return {
      code: 'MEDIA_PURGE_INCOMPLETE',
      error:
        "We couldn't remove all of your photos. Some remote photos may already be gone, but your account and database records remain so the deletion can be retried safely.",
    };
  }
  if (code === 'MEDIA_PURGE_NOT_CONFIGURED') {
    return {
      code: 'MEDIA_PURGE_NOT_CONFIGURED',
      error:
        "Photo storage isn't configured on this server, so we can't guarantee a complete deletion. Your account and database records remain.",
    };
  }
  if (code === 'UNAUTHENTICATED') {
    return {
      code: 'UNAUTHENTICATED',
      error: 'Sign in to delete your account.',
    };
  }
  return {
    error:
      "We couldn't complete the deletion. Some remote photos may already be gone; please try again.",
  };
}

/**
 * Delete the signed-in user's account and everything in it.
 *
 * Two deletions have to happen, in this order:
 *
 * 1. **App data** via {@link eraseUserAccount}. If it throws, the account still
 *    exists and the user can retry — a partial deletion the operator can finish
 *    is strictly better than an identity with no data behind it.
 * 2. **The Clerk identity**, via the admin API. This is not optional cleanup:
 *    `syncClerkUser` lazily re-creates an app user the next time a known Clerk
 *    id signs in, so skipping it would silently resurrect the account as an
 *    empty shell and make the deletion look like a bug rather than a deletion.
 *
 * A Clerk failure after step 1 is reported but does **not** roll anything back;
 * the data is already gone and re-creating it would be the actual harm. The
 * user is told their data is deleted and their sign-in will be removed shortly,
 * which is true: the `user.deleted` webhook path is idempotent via
 * `hasBeenErased`, so a retry costs nothing.
 */
export async function deleteAccountAction(confirmation: string): Promise<DeleteAccountResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  if (confirmation.trim().toUpperCase() !== DELETION_CONFIRM_PHRASE.toUpperCase()) {
    return {
      ok: false,
      code: 'CONFIRMATION_MISMATCH',
      error: `Type ${DELETION_CONFIRM_PHRASE} to confirm.`,
    };
  }

  let clerkId: string | null;
  try {
    const user = await requireUser();
    clerkId = user.clerkId ?? null;

    await eraseUserAccount(user.id, {
      trigger: 'in_app',
      noticeVersion: DELETION_NOTICE_VERSION,
    });
  } catch (error) {
    return { ok: false, ...messageFor(error) };
  }

  // Step 2. Deliberately outside the try above: the data is gone either way,
  // and reporting a Clerk hiccup as "deletion failed" would be a lie that
  // invites the user to retry a deletion that already succeeded.
  if (clerkId) {
    try {
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      await client.users.deleteUser(clerkId);
    } catch {
      // Swallowed on purpose. The webhook and a manual admin delete both
      // converge on the same erased state, and `hasBeenErased` makes the
      // repeat a no-op.
      log.error('account.clerk_cleanup_failed');
    }
  }

  return { ok: true };
}

/**
 * Set or clear the signed-in user's profile photo (issue #659).
 *
 * A thin wrapper by design: validation bounds the URL to `ALLOWED_MEDIA_HOSTS`
 * (#216) and `updateAvatar` scopes the write to the caller's own row, so this
 * function holds no authorization of its own.
 */
export async function updateAvatarAction(url: string): Promise<UpdateAvatarResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: 'Saving a photo needs a database.' };
  }

  const parsed = avatarInput.safeParse({ url });
  if (!parsed.success) {
    return { ok: false, error: "That image host isn't supported." };
  }

  try {
    const user = await requireUser();
    const result = await updateAvatar(parsed.data, user);
    revalidatePath('/profile');
    return { ok: true, avatarUrl: result.avatarUrl };
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return { ok: false, error: 'Sign in to change your photo.' };
    }
    return { ok: false, error: "We couldn't save that photo." };
  }
}
