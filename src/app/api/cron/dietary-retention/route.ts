import { isCronAuthorized, isCronConfigured } from '~/server/cron/auth';
import { isDbConfigured } from '~/server/db';
import { purgeExpiredDietaryHistory } from '~/server/dietary/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return Response.json(
      { error: 'Dietary retention endpoint is not configured.' },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return Response.json({
      ok: true,
      assessmentsDeleted: 0,
      correctionsDeleted: 0,
    });
  }

  const result = await purgeExpiredDietaryHistory();
  return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
}
