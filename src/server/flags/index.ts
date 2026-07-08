import "server-only";

import { getCurrentUser } from "~/server/auth";
import { getAllFlags, getFlag } from "~/lib/analytics/server";
import { type FlagMap, type FlagValue } from "~/lib/analytics/flags-shared";

/**
 * Ergonomic server-side feature-flag helpers (issue #335) for Server Components
 * and server actions. They resolve the current user's distinct id automatically
 * and delegate to the analytics server client, which returns control ({}/fallback)
 * whenever analytics is unconfigured — so callers never block render or throw.
 *
 * Flags are keyed by the same internal user id used for identify (#321), so an
 * SSR-evaluated variant matches what the identified browser session will see —
 * the basis for the no-flicker bootstrap.
 */

/** The distinct id to evaluate flags against — the signed-in user, else anon. */
async function flagDistinctId(): Promise<string> {
  const user = await getCurrentUser();
  return user?.id ?? "anonymous";
}

/** Evaluate every flag for the current user (empty map = all control). */
export async function getUserFlags(): Promise<FlagMap> {
  return getAllFlags(await flagDistinctId());
}

/** Evaluate a single flag for the current user, falling back to control. */
export async function getUserFlag(
  key: string,
  fallback: FlagValue = false,
): Promise<FlagValue> {
  return getFlag(await flagDistinctId(), key, fallback);
}
