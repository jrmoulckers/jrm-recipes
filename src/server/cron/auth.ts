import "server-only";

import { env } from "~/env";

/**
 * Shared bearer-secret guard for the scheduled cron endpoints (#354/#353).
 *
 * Every cron route (`/api/cron/digest`, `/api/cron/cook-along-reminders`)
 * funnels through here so authorization is defined in exactly one place. The
 * model mirrors the app's other integrations: with `CRON_SECRET` unset the
 * endpoints are *disabled* (the route returns 503) so they can never run
 * anonymously, and a wrong/absent bearer is rejected (401). Vercel Cron sends
 * the configured secret as `Authorization: Bearer <CRON_SECRET>`.
 */

/** True when a cron secret is configured and the endpoints may run. */
export function isCronConfigured(): boolean {
  return Boolean(env.CRON_SECRET);
}

/**
 * Verify a request carries the shared cron secret as a bearer token. Returns
 * false when unconfigured (callers should surface that as a 503, not a 401) or
 * when the header is missing/incorrect.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
