import "server-only";

import { db, isDbConfigured } from "~/server/db";
import { waitlistSignups } from "~/server/db/schema";
import { type WaitlistData } from "./validation";

/**
 * Outcome of a waitlist submission:
 * - `created`     — a new signup was stored.
 * - `duplicate`   — the email was already on the list (deduped, no-op).
 * - `unavailable` — no database configured; nothing persisted (degrade safely).
 */
export type WaitlistResult = "created" | "duplicate" | "unavailable";

/**
 * Persist a waitlist signup, deduped by email (issue #351). Relies on the
 * `waitlist_signups_email_unique` constraint + `onConflictDoNothing`, so a
 * repeat submission is a silent no-op rather than an error or a duplicate row.
 * Returns `unavailable` (never throws) when `DATABASE_URL` is unset.
 */
export async function addToWaitlist(data: WaitlistData): Promise<WaitlistResult> {
  if (!isDbConfigured()) return "unavailable";

  const [row] = await db
    .insert(waitlistSignups)
    .values({ email: data.email, source: data.source })
    .onConflictDoNothing({ target: waitlistSignups.email })
    .returning({ id: waitlistSignups.id });

  return row ? "created" : "duplicate";
}
