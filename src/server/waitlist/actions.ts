"use server";

import { addToWaitlist } from "./mutations";
import { createRateLimiter } from "./rate-limit";
import { waitlistInput, type WaitlistInput } from "./validation";

export type WaitlistActionResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Global, best-effort burst guard (issue #351). A signed-out form has no
 * trustworthy per-caller identity, so this caps the process-wide submission
 * rate as a safety valve; the unique-email index bounds what actually persists.
 */
const limiter = createRateLimiter(30, 10_000);

/**
 * Capture a landing-page waitlist email (issue #351). Validates + normalizes via
 * Zod (size guard + dedupe key), rate-limits trivial bursts, and stores the
 * signup deduped by email. Works signed-out and degrades gracefully when no DB
 * is configured (the submission is accepted UX-wise but nothing persists). The
 * success analytics event is emitted client-side (browser distinct id) so no
 * PII — not even the email — is ever attached to an event.
 */
export async function joinWaitlistAction(
  input: WaitlistInput,
): Promise<WaitlistActionResult> {
  const parsed = waitlistInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please enter a valid email.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (!limiter.hit()) {
    return {
      ok: false,
      error: "Too many requests right now — please try again in a moment.",
    };
  }

  try {
    const result = await addToWaitlist(parsed.data);
    // `unavailable` (no DB) still reports success so cold traffic isn't shown a
    // scary error for a misconfiguration they can't fix; nothing was persisted.
    return { ok: true, duplicate: result === "duplicate" };
  } catch {
    return {
      ok: false,
      error: "We couldn't save that right now. Please try again.",
    };
  }
}
