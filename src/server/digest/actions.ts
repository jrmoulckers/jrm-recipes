"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { captureServer } from "~/lib/analytics/server";
import { requireUser } from "~/server/auth";
import { db, isDbConfigured } from "~/server/db";
import { users } from "~/server/db/schema";

export type DigestPrefResult =
  | { ok: true; optedIn: boolean }
  | { ok: false; error: string };

/**
 * Toggle the signed-in user's weekly-digest opt-in (issue #354). Persisted per
 * user (default off). Emits a non-PII `digest_opt_in_changed` event attributed
 * to the internal user id.
 */
export async function setWeeklyDigestOptInAction(
  optedIn: boolean,
): Promise<DigestPrefResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Email preferences need a database." };
  }

  const user = await requireUser();
  try {
    await db
      .update(users)
      .set({ weeklyDigestOptIn: optedIn })
      .where(eq(users.id, user.id));
    void captureServer(user.id, "digest_opt_in_changed", { optedIn });
    revalidatePath("/settings/notifications");
    return { ok: true, optedIn };
  } catch {
    return {
      ok: false,
      error: "We couldn't update your preference. Please try again.",
    };
  }
}
