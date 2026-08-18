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
import postgres from 'postgres';

import { buildAliasIndex, pickFoodId } from '../src/lib/food-resolve';

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.log('[backfill-food-links] No database URL set, nothing to do.');
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

type AliasRow = { alias: string; food_id: string; use_count: number };
type FoodItemRow = { id: string };
type IngredientRow = { id: string; item: string; food_id: string | null; recipe_id: string };

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
    SELECT id, item, food_id, recipe_id FROM recipe_ingredients
  `;

  let updated = 0;
  const touchedRecipes = new Set<string>();
  for (const row of rows) {
    const resolved = pickFoodId(row.item, index);
    const next = resolved && existing.has(resolved) ? resolved : null;
    if (next === row.food_id) continue;
    await sql`
      UPDATE recipe_ingredients
      SET food_id = ${next}
      WHERE id = ${row.id} AND food_id IS DISTINCT FROM ${next}
    `;
    touchedRecipes.add(row.recipe_id);
    updated++;
  }

  // A changed link changes which foods the recipe resolves to, and therefore its
  // nutrition (#1044). This is the one ingredient-link edit that happens outside
  // a recipe save, so it has to invalidate the derived cache itself. Deleting
  // (rather than recomputing here) keeps this script's job narrow: the next read
  // computes, and `pnpm db:backfill-nutrition` repopulates in bulk.
  let invalidated = 0;
  if (touchedRecipes.size > 0) {
    const ids = [...touchedRecipes];
    const [{ count } = { count: 0 }] = await sql<{ count: number }[]>`
      WITH deleted AS (
        DELETE FROM recipe_nutrition_cache WHERE recipe_id = ANY(${ids}) RETURNING 1
      )
      SELECT count(*)::int AS count FROM deleted
    `;
    invalidated = count;
  }

  console.log(
    `[backfill-food-links] Scanned ${rows.length} ingredient line(s); updated ${updated}; ` +
      `invalidated ${invalidated} cached nutrition row(s) across ${touchedRecipes.size} recipe(s).`,
  );
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('[backfill-food-links] Failed:', error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
