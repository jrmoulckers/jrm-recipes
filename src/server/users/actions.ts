"use server";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { eraseUserAccount } from "~/server/users/erasure";
import {
  DELETION_CONFIRM_PHRASE,
  DELETION_NOTICE_VERSION,
} from "~/server/users/deletion-notice";

export type DeleteAccountResult =
  { ok: true } | { ok: false; error: string; code?: string };

const NO_DB =
  "Account deletion needs a database. Set DATABASE_URL (see .env.example).";

function messageFor(error: unknown): { error: string; code?: string } {
  const code = error instanceof Error ? error.message : "";
  if (code.startsWith("MEDIA_PURGE_INCOMPLETE")) {
    return {
      code: "MEDIA_PURGE_INCOMPLETE",
      error:
        "We couldn't remove all of your photos, so we stopped before deleting anything else. Nothing has been lost. Please try again in a few minutes.",
    };
  }
  if (code === "MEDIA_PURGE_NOT_CONFIGURED") {
    return {
      code: "MEDIA_PURGE_NOT_CONFIGURED",
      error:
        "Photo storage isn't configured on this server, so we can't guarantee a complete deletion. Nothing has been deleted.",
    };
  }
  if (code === "UNAUTHENTICATED") {
    return {
      code: "UNAUTHENTICATED",
      error: "Sign in to delete your account.",
    };
  }
  return {
    error:
      "We couldn't complete the deletion, so nothing has been deleted. Please try again.",
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
export async function deleteAccountAction(
  confirmation: string,
): Promise<DeleteAccountResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  if (
    confirmation.trim().toUpperCase() !== DELETION_CONFIRM_PHRASE.toUpperCase()
  ) {
    return {
      ok: false,
      code: "CONFIRMATION_MISMATCH",
      error: `Type ${DELETION_CONFIRM_PHRASE} to confirm.`,
    };
  }

  let clerkId: string | null = null;
  try {
    const user = await requireUser();
    clerkId = user.clerkId ?? null;

    const result = await eraseUserAccount(user.id, {
      trigger: "in_app",
      noticeVersion: DELETION_NOTICE_VERSION,
    });

    // Held, not failed, and not done (#694). Nothing was deleted, so the Clerk
    // identity must stay too: removing it here would strand a sign-in for an
    // account whose data is still present. Say so plainly rather than reporting
    // an erasure that has not happened.
    if (result.status === "held") {
      return {
        ok: false,
        code: "ERASURE_HELD",
        error:
          "Your request is recorded, and nothing has been deleted yet. Some of your writing is part of a recipe you share with someone else, and we can't separate it safely today. We'll finish your deletion as soon as we can, and we'll be in touch.",
      };
    }
  } catch (error) {
    return { ok: false, ...messageFor(error) };
  }

  // Step 2. Deliberately outside the try above: the data is gone either way,
  // and reporting a Clerk hiccup as "deletion failed" would be a lie that
  // invites the user to retry a deletion that already succeeded.
  if (clerkId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.users.deleteUser(clerkId);
    } catch {
      // Swallowed on purpose. The webhook and a manual admin delete both
      // converge on the same erased state, and `hasBeenErased` makes the
      // repeat a no-op.
    }
  }

  return { ok: true };
}
