/**
 * Backfill the derived nutrition cache (issue #1044, ADR-0007).
 *
 * `recipe_nutrition_cache` is populated after each recipe save, so it only ever
 * covers recipes that have been written *since* the cache existed. This script
 * fills the rest, and is also how a resolver-version change is rolled out: after
 * #1030 revises the USDA portion gram weights, every existing row is stamped
 * with the old version and reads fall back to computing until this runs.
 *
 * **Resumable.** Work is claimed in id-ordered batches and the completion test
 * is the data itself: a recipe is done when it has a row at the *current*
 * resolver version. Kill the process at any point and re-run it, and it picks up
 * exactly where it stopped — no cursor file, no state to corrupt. This matters
 * because the natural way to run it is against production, where a long job
 * being interrupted is normal rather than exceptional.
 *
 * **Idempotent.** A completed run leaves nothing to do, so a second run scans,
 * finds no candidates, and writes zero rows. Individual writes are upserts
 * guarded on `recipe_updated_at`, so a recipe saved mid-run keeps the fresher
 * figures its own post-save refresh wrote rather than being clobbered by this
 * script's older computation.
 *
 * Manual nutrition is deliberately not consulted: the cache stores the *derived*
 * answer, and `getRecipeNutritionView` applies the cook's own numbers above it
 * on every read. A recipe with a manual override still gets a derived row, which
 * is what search and planner roll-ups will want when they need an estimate.
 *
 * Usage:
 *   pnpm db:backfill-nutrition             # backfill everything outstanding
 *   pnpm db:backfill-nutrition --dry       # report what's outstanding, write nothing
 *   pnpm db:backfill-nutrition --limit=500 # stop after N recipes (resume later)
 *   pnpm db:backfill-nutrition --batch=100 # rows claimed per round-trip
 *
 * Connection: prefers a direct (non-pooled) URL for the DML, mirroring
 * `scripts/migrate.mjs` and `scripts/backfill-food-links.ts`.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

import { nutritionResolverVersion } from '~/lib/nutrition-version';
import * as schema from '~/server/db/schema';
import { refreshNutritionCache } from '~/server/recipes/nutrition-cache';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

function numericFlag(name: string, fallback: number): number {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const parsed = raw == null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const batchSize = numericFlag('batch', 200);
const limit = numericFlag('limit', Number.MAX_SAFE_INTEGER);

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.log('[backfill-nutrition] No database URL set, nothing to do.');
  process.exit(0);
}

const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
const db = drizzle(client, { schema, casing: 'snake_case' });

const version = nutritionResolverVersion();

/**
 * The next batch of live recipes with no row at the current resolver version.
 *
 * Keyed off `id > cursor` rather than an offset so a row written mid-scan can't
 * shift the window and cause a recipe to be skipped. The `NOT EXISTS` is what
 * makes the scan self-terminating on a re-run.
 */
async function claimBatch(cursor: string, size: number): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT r.id
    FROM recipes r
    WHERE r.deleted_at IS NULL
      AND r.id > ${cursor}
      AND NOT EXISTS (
        SELECT 1 FROM recipe_nutrition_cache c
        WHERE c.recipe_id = r.id AND c.resolver_version = ${version}
      )
    ORDER BY r.id
    LIMIT ${size}
  `);
  return [...rows].map((r) => r.id);
}

async function outstandingCount(): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM recipes r
    WHERE r.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM recipe_nutrition_cache c
        WHERE c.recipe_id = r.id AND c.resolver_version = ${version}
      )
  `);
  return [...rows][0]?.count ?? 0;
}

async function main() {
  const outstanding = await outstandingCount();
  console.log(
    `[backfill-nutrition] Resolver version ${version}; ` +
      `${outstanding} recipe(s) outstanding, batch ${batchSize}.`,
  );

  if (dryRun) {
    console.log('[backfill-nutrition] --dry: no database writes performed.');
    return;
  }

  let cursor = '';
  let processed = 0;
  let failed = 0;

  while (processed < limit) {
    const size = Math.min(batchSize, limit - processed);
    const ids = await claimBatch(cursor, size);
    if (ids.length === 0) break;

    for (const id of ids) {
      // Sequential on purpose: the connection is `max: 1`, and a backfill that
      // saturates the database is a backfill nobody dares run against
      // production.
      const view = await refreshNutritionCache(db, id);
      if (!view) failed++;
      processed++;
    }

    cursor = ids[ids.length - 1]!;
    console.log(`[backfill-nutrition] ${processed} processed (cursor ${cursor}).`);
  }

  const remaining = await outstandingCount();
  console.log(
    `[backfill-nutrition] Done. Processed ${processed}; ${failed} could not be computed; ` +
      `${remaining} still outstanding` +
      (remaining > 0 ? ' — re-run to resume.' : '.'),
  );
}

main()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('[backfill-nutrition] Failed:', error);
    await client.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
