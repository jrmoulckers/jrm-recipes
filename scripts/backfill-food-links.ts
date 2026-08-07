/**
 * One-off backfill: populate `recipe_ingredients.food_id` for existing rows.
 *
 * The write-time link to the canonical food graph (see `docs/food-graph.md`) is
 * set on every recipe save by `resolveFoodIds` (src/server/db/resolve-food.ts),
 * but ingredient lines written before this feature have a NULL `food_id`. This
 * script resolves each existing line's `item` text with the SAME pure core the
 * write path uses (`~/lib/food-resolve`) and writes the resulting node id.
 *
 * Idempotent: re-running recomputes the same ids and only writes when the value
 * changes (`IS DISTINCT FROM`). Run with `pnpm db:backfill-food-links`.
 *
 * Connection: prefers a direct (non-pooled) URL for the DML, mirroring
 * `scripts/migrate.mjs` and `scripts/backfill-dietary-tags.ts`.
 */
import postgres from "postgres";

import { buildAliasIndex, pickFoodId } from "../src/lib/food-resolve";

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.log("[backfill-food-links] No database URL set, nothing to do.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

type AliasRow = { alias: string; food_id: string; use_count: number };
type FoodItemRow = { id: string };
type IngredientRow = { id: string; item: string; food_id: string | null };

async function main() {
  // The live alias index + the set of existing nodes, so a resolved id that
  // isn't seeded here is never written (keeps the FK satisfiable).
  const aliasRows = await sql<AliasRow[]>`
    SELECT alias, food_id, use_count FROM food_aliases
  `;
  const index = buildAliasIndex(
    aliasRows.map((r) => ({
      alias: r.alias,
      foodId: r.food_id,
      useCount: r.use_count,
    })),
  );

  const foodItems = await sql<FoodItemRow[]>`SELECT id FROM food_items`;
  const existing = new Set(foodItems.map((r) => r.id));

  const rows = await sql<IngredientRow[]>`
    SELECT id, item, food_id FROM recipe_ingredients
  `;

  let updated = 0;
  for (const row of rows) {
    const resolved = pickFoodId(row.item, index);
    const next = resolved && existing.has(resolved) ? resolved : null;
    if (next === row.food_id) continue;
    await sql`
      UPDATE recipe_ingredients
      SET food_id = ${next}
      WHERE id = ${row.id} AND food_id IS DISTINCT FROM ${next}
    `;
    updated++;
  }

  console.log(
    `[backfill-food-links] Scanned ${rows.length} ingredient line(s); updated ${updated}.`,
  );
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("[backfill-food-links] Failed:", error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
