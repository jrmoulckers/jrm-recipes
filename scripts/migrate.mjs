// @ts-check
/**
 * Deploy-time database migration runner.
 *
 * Runs the generated Drizzle SQL migrations (./drizzle) against DATABASE_URL.
 * Wired into the `vercel-build` script so a production deploy brings the
 * database schema up to date automatically — the human only has to paste
 * DATABASE_URL into Vercel once.
 *
 * Safe by design: if no database URL is set (e.g. a preview build with no DB),
 * it logs and exits 0 so the build still succeeds. The app boots without a DB.
 *
 * Connection choice: migrations run DDL, which can misbehave through a
 * transaction pooler (e.g. Neon/PgBouncer). We therefore prefer a direct
 * (non-pooled) connection when one is available, falling back to DATABASE_URL.
 * The app runtime still uses the pooled DATABASE_URL for serverless scale.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { createLogger } from "../src/lib/log.js";

const log = createLogger({ scope: "migrate" });

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  log.info("No database URL set — skipping migrations.");
  process.exit(0);
}

// Preview-deploy safety net (#258): a preview build shares Vercel's project
// env, so a `DATABASE_URL` added to the Preview environment would otherwise
// point these DDL migrations at the *production* database. Never migrate from a
// preview deploy unless an isolated per-branch database (e.g. a Neon branch) is
// explicitly wired in and opted into via ALLOW_PREVIEW_MIGRATIONS=1. Production
// (`VERCEL_ENV=production`) and local/CI (no `VERCEL_ENV`) are unaffected.
if (
  process.env.VERCEL_ENV === "preview" &&
  process.env.ALLOW_PREVIEW_MIGRATIONS !== "1"
) {
  log.warn(
    "Preview deploy detected — skipping migrations to protect the " +
      "production database. Provision a per-branch database and set " +
      "ALLOW_PREVIEW_MIGRATIONS=1 to run them against the isolated branch.",
  );
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  log.info("Applying migrations from ./drizzle …");
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  log.info("Database is up to date.");
  await sql.end();
  process.exit(0);
} catch (error) {
  log.error("Migration failed.", { error });
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
