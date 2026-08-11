import { isCronAuthorized, isCronConfigured } from '~/server/cron/auth';
import { isDbConfigured } from '~/server/db';
import { getErasureBacklog } from '~/server/users/erasure-holds';

// Reads Postgres, so keep it on the Node runtime. Always dynamic: a cached
// backlog count is a wrong backlog count.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Erasure backlog report (issue #694).
 *
 * Erasure requests that touch a co-created recipe are held rather than executed,
 * because executing them destroys the only evidence needed to remedy the
 * co-creator gap. A held request nobody can see is indistinguishable from a
 * dropped one, which is its own compliance failure — so the backlog is reported
 * here: how many are open, how long the oldest has waited, and how many recipes
 * the eventual remedy has to cover.
 *
 * Authenticated with the shared cron secret, like the other scheduled
 * endpoints: unset disables it (503) so it can never be read anonymously, and a
 * wrong bearer is 401. The payload is counts and one timestamp — no ids, no
 * identifiers — so polling it cannot rebuild the profiles these requests are
 * asking to erase.
 *
 * A non-zero `open` is the alert condition. It is not an outage; it is a queue
 * waiting on a product decision, and it is meant to stay visible until that
 * decision lands.
 */
async function handle(request: Request): Promise<Response> {
  if (!isCronConfigured()) {
    return Response.json({ error: 'Erasure backlog endpoint is not configured.' }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return Response.json({
      ok: true,
      open: 0,
      oldestRequestedAt: null,
      totalEntangledRecipes: 0,
    });
  }

  const backlog = await getErasureBacklog();
  return Response.json({ ok: true, ...backlog }, { headers: { 'cache-control': 'no-store' } });
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
