import { sql } from "drizzle-orm";

import packageJson from "../../../../package.json";
import { db, isDbConfigured } from "~/server/db";

// The DB probe needs Node's `postgres` driver, so keep this off the edge
// runtime. `force-dynamic` + `revalidate: 0` guarantee a live check every hit
// (never a cached 200) so an uptime monitor sees the real current state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Commit the running build was produced from. Vercel and GitHub Actions expose
 * it under different names; falls back to `dev` for a local `next start`.
 */
const BUILD_SHA =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "dev";

/** Human-readable release version, kept in lockstep by release-please (#265). */
const VERSION = packageJson.version;

/** Give up on the connectivity probe quickly — health must stay cheap. */
const DB_PROBE_TIMEOUT_MS = 2_000;

async function probeDatabase(): Promise<"ok" | "degraded" | "not_configured"> {
  if (!isDbConfigured()) return "not_configured";
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("db probe timeout")),
          DB_PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    return "ok";
  } catch {
    return "degraded";
  }
}

/**
 * Liveness/readiness probe (#264).
 *
 * `GET /api/health` returns the build SHA and a cheap database-connectivity
 * check for external uptime monitoring. It is intentionally unauthenticated,
 * fast, and leaks no internals: the DB result is a coarse enum
 * (`ok`/`degraded`/`not_configured`), never a driver error or connection
 * string. In zero-config mode it reports `db: "not_configured"` and still
 * returns 200 (the app is up; it just has no database), so a monitor only
 * alarms on a real outage.
 *
 * Status codes:
 * - **200** — app is up and the DB is reachable (or intentionally absent).
 * - **503** — a database *is* configured but unreachable (degraded), so a
 *   monitor can alert.
 */
export async function GET() {
  const database = await probeDatabase();
  const healthy = database !== "degraded";

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      version: VERSION,
      sha: BUILD_SHA,
      db: database,
      time: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
