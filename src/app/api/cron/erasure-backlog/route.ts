import { isCronAuthorized, isCronConfigured } from '~/server/cron/auth';
import { isDbConfigured } from '~/server/db';
import { getErasureBacklog } from '~/server/users/erasure-holds';
import { replayOpenErasureHolds } from '~/server/users/erasure-replay';

// Reads Postgres, so keep it on the Node runtime. Always dynamic: a cached
// backlog count is a wrong backlog count.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Erasure backlog report (issue #694).
 *
 * Historical erasure requests held before ADR-0009 are replayed in bounded
 * batches by the scheduled GET. Authenticated POST provides the same operation
 * for an explicit operator retry.
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
export function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!isCronConfigured()) {
    return Response.json({ error: 'Erasure backlog endpoint is not configured.' }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return Response.json({ ok: true, attempted: 0, erased: 0, failed: 0 });
  }

  const replay = await replayOpenErasureHolds();
  const backlog = await getErasureBacklog();
  return Response.json(
    { ok: replay.failed === 0, ...replay, backlog },
    {
      status: replay.failed === 0 ? 200 : 500,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
