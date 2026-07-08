import { index, pgTable, varchar } from "drizzle-orm/pg-core";

import { pk, timestamps } from "./_shared";

/**
 * Landing-page email / waitlist capture for cold-traffic conversion (issue
 * #351). A lightweight, provider-agnostic store: we keep the email locally now
 * (deduped, case-normalized by the server module before insert) with a `source`
 * tag noting where it was captured, ready to forward to an ESP later. No PII
 * beyond the email itself.
 */
export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: pk(),
    // Unique so a repeat submission is a no-op dedupe, not a duplicate row.
    email: varchar({ length: 320 }).notNull().unique(),
    source: varchar({ length: 60 }).notNull().default("landing"),
    ...timestamps(),
  },
  (t) => [index("waitlist_signups_created_idx").on(t.createdAt)],
);

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;
