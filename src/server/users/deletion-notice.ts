/**
 * Constants shared by the deletion notice UI and the erasure action (#678).
 *
 * Deliberately its own module: a `"use server"` file may only export async
 * functions, and the client needs both of these at render time.
 */

/**
 * The exact confirmation copy the user agreed to.
 *
 * Recorded on the tombstone so a later dispute can be answered with *which*
 * notice was shown, not just that one was. Bump whenever the substance of the
 * notice changes — a wording tidy does not need a bump, a change to what
 * survives does.
 */
export const DELETION_NOTICE_VERSION = '2026-02-account-erasure-v1';

/** What the user must type. Matched case-insensitively after trimming. */
export const DELETION_CONFIRM_PHRASE = 'DELETE';
