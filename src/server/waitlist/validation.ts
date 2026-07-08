import { z } from "zod";

/**
 * Where a waitlist signup was captured. Kept to a small enum so the `source`
 * tag stays low-cardinality and non-identifying (issue #351).
 */
export const WAITLIST_SOURCES = ["landing", "hero", "closing"] as const;

export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

/**
 * A landing-page waitlist submission. The email is trimmed + lower-cased so
 * dedupe is case-insensitive, and length-bounded (a size abuse guard). `source`
 * defaults to the generic landing bucket.
 */
export const waitlistInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email")
    .max(320, "That email is too long")
    .email("Enter a valid email"),
  source: z.enum(WAITLIST_SOURCES).default("landing"),
});

export type WaitlistInput = z.input<typeof waitlistInput>;
export type WaitlistData = z.infer<typeof waitlistInput>;
