import { isCronAuthorized, isCronConfigured } from "~/server/cron/auth";
import { sendDueCookAlongReminders } from "~/server/cookalong/mutations";
import { isDbConfigured } from "~/server/db";

// Writes notifications + stamps reminderSentAt, so keep it on the Node runtime
// and never cache — it's a scheduled side-effecting trigger.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fire reminders for events starting within the next 2 hours. The job runs
// hourly (see vercel.json), so a 2h window guarantees every event is covered by
// at least one run before it starts; `reminderSentAt` makes repeats a no-op.
const WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Cook-along reminder cron (issue #353). Scheduled by Vercel Cron and guarded by
 * `CRON_SECRET` (503 when unset, 401 on a bad/absent bearer). Delegates to
 * {@link sendDueCookAlongReminders}, which finds cook-alongs starting within the
 * reminder window that haven't been reminded, notifies the going/maybe RSVPs,
 * and stamps `reminderSentAt` so each event fires exactly once — the job is
 * idempotent and safe to run every hour. Returns how many events were reminded.
 */
async function handle(request: Request): Promise<Response> {
  if (!isCronConfigured()) {
    return Response.json(
      { error: "Cook-along reminder endpoint is not configured." },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return Response.json({ ok: true, reminded: 0 });
  }

  const reminded = await sendDueCookAlongReminders(WINDOW_MS);
  return Response.json({ ok: true, reminded });
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
