import { isCronAuthorized, isCronConfigured } from "~/server/cron/auth";
import { isDbConfigured } from "~/server/db";
import { buildWeeklyDigest } from "~/server/digest/builder";
import { getEmailProvider, renderDigestEmail } from "~/server/digest/email";
import {
  getUserDigestData,
  listDigestRecipients,
} from "~/server/digest/queries";
import { log } from "~/lib/log";

// Reads Postgres + may call an email provider, so keep it on the Node runtime.
// Always dynamic — it's a scheduled side-effecting trigger, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weekly-digest cron (issue #354). Scheduled by Vercel Cron (see vercel.json)
 * and guarded by `CRON_SECRET`: when the secret is unset the endpoint is
 * disabled (503) so it can never be run anonymously; a wrong/absent bearer is
 * 401. For each opted-in user it builds a 7-day, group-scoped digest and sends
 * it via the pluggable provider — Resend when `RESEND_API_KEY` is set, a
 * log/no-op otherwise. Users with no activity are skipped so we never send an
 * empty email, and a single failed send is isolated so it can't abort the run.
 * Returns per-run counts (no PII).
 */
async function handle(request: Request): Promise<Response> {
  if (!isCronConfigured()) {
    return Response.json(
      { error: "Digest endpoint is not configured." },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return Response.json({ ok: true, sent: 0, skipped: 0, recipients: 0 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const recipients = await listDigestRecipients();
  const provider = getEmailProvider();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.email) {
      skipped++;
      continue;
    }

    const data = await getUserDigestData(recipient.id, since);
    const digest = buildWeeklyDigest({
      groups: data.groups,
      recipes: data.recipes,
      now,
      windowDays: WINDOW_DAYS,
    });

    if (!digest) {
      skipped++;
      continue;
    }

    const email = renderDigestEmail(digest);
    try {
      await provider.send({ to: recipient.email, ...email });
      sent++;
    } catch (error) {
      // Isolate a bad recipient/provider hiccup so the rest of the run proceeds.
      failed++;
      log.error("digest: send failed for recipient", {
        provider: provider.name,
        error,
      });
    }
  }

  return Response.json({
    ok: true,
    provider: provider.name,
    recipients: recipients.length,
    sent,
    skipped,
    failed,
  });
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
