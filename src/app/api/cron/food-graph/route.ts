import { isCronAuthorized, isCronConfigured } from "~/server/cron/auth";
import { isDbConfigured } from "~/server/db";
import { ingestFoodGraph } from "~/server/db/ingest-food-graph";
import { log } from "~/lib/log";

// Reads the whole recipe-ingredient corpus and rewrites the derived food-graph
// tables, so keep it on the Node runtime. Always dynamic — it's a scheduled
// side-effecting trigger, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The full recompute scales with the corpus; give it plenty of headroom (Vercel
// caps this to the plan's maximum). This is exactly why the pass belongs on a
// scheduled job and not in a user's save request (see mutations.ts).
export const maxDuration = 300;

/**
 * Food-graph recompute cron. Scheduled by Vercel Cron (see vercel.json) and
 * guarded by `CRON_SECRET`: when the secret is unset the endpoint is disabled
 * (503) so it can never run anonymously; a wrong/absent bearer is 401.
 *
 * Runs the idempotent full {@link ingestFoodGraph} pass that rebuilds the mined
 * food-graph tables (unit/prep stats, pairs, mined aliases, denormalized
 * recipe counts) from the live `recipe_ingredients` corpus. It used to run
 * fire-and-forget on every recipe write, which opened a large, table-locking
 * transaction in the request path and timed saves out (504) on serverless.
 * Moving it here restores the "nightly backstop" the ingest was designed around
 * while write-time `resolveFoodIds` keeps linking new ingredients to their food
 * node immediately. Returns per-run counts (no PII).
 */
async function handle(request: Request): Promise<Response> {
  if (!isCronConfigured()) {
    return Response.json(
      { error: "Food-graph endpoint is not configured." },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return Response.json({ ok: true, skipped: true });
  }

  const startedAt = Date.now();
  try {
    const result = await ingestFoodGraph();
    return Response.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    log.error("food-graph: recompute failed", { error });
    return Response.json(
      { ok: false, error: "Food-graph recompute failed." },
      { status: 500 },
    );
  }
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
