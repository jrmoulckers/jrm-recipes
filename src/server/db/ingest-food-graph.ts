import "server-only";

import { eq, isNull, sql } from "drizzle-orm";

import {
  mineFoodGraph,
  type MinedIngredient,
  type MiningOptions,
} from "~/lib/food-mining";
import { stableHash } from "~/lib/food-db";
import { db, isDbConfigured } from "~/server/db";
import {
  foodAliases,
  foodItems,
  foodPairs,
  foodPrepStats,
  foodRecipeLinks,
  foodUnitStats,
  recipeIngredients,
  recipes,
  userFoodPrefs,
} from "~/server/db/schema";

/**
 * Batch ingestion for the live food graph (see `docs/food-graph.md`). Reads the
 * whole `recipe_ingredients` corpus, mines it with the pure {@link mineFoodGraph}
 * aggregator, and rewrites the derived graph tables (`food_unit_stats`,
 * `food_prep_stats`, `food_pairs`, mined `food_aliases`) plus each node's
 * denormalized `recipeCount`.
 *
 * Designed to run as a nightly/full recompute: the derived tables are rebuilt
 * from scratch each run, so it is idempotent and self-correcting (foods that
 * stop being used drop back to zero). Curated data, the seeded `food_items`
 * nodes and their `source = 'curated'` aliases, is preserved. Only mined data
 * is replaced. It runs on a schedule via the `/api/cron/food-graph` cron
 * (see `vercel.json`), never in a user's request path: an earlier "Phase 2"
 * design triggered this full pass on every recipe write, whose large,
 * table-locking transaction timed saves out (504) on serverless. Write-time
 * `resolveFoodIds` still links new ingredients to their food node immediately.
 * Only the mined *stats* wait for the next scheduled pass.
 */

/** How many rows to insert per statement (keeps bind-parameter counts sane). */
const INSERT_CHUNK = 500;

function chunk<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export type IngestResult = {
  ingredientsScanned: number;
  nodesTouched: number;
  aliases: number;
  unitStats: number;
  prepStats: number;
  pairs: number;
  userPrefs: number;
  recipeLinks: number;
};

/**
 * Run a full ingestion pass. No-op (returns zeroed counts) when no database is
 * configured. Options tune the surfacing thresholds passed to the miner.
 */
export async function ingestFoodGraph(
  options: MiningOptions = {},
): Promise<IngestResult> {
  const empty: IngestResult = {
    ingredientsScanned: 0,
    nodesTouched: 0,
    aliases: 0,
    unitStats: 0,
    prepStats: 0,
    pairs: 0,
    userPrefs: 0,
    recipeLinks: 0,
  };
  if (!isDbConfigured()) return empty;

  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      item: recipeIngredients.item,
      unit: recipeIngredients.unit,
      quantity: recipeIngredients.quantity,
      prep: recipeIngredients.prep,
      authorId: recipes.authorId,
    })
    .from(recipeIngredients)
    // Soft-deleted recipes (issue #165 tombstones) must not skew the graph:
    // join their parent and keep only live rows. Restoring heals on next pass.
    .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
    .where(isNull(recipes.deletedAt));

  const mined = mineFoodGraph(rows satisfies MinedIngredient[], options);

  await db.transaction(async (tx) => {
    // Reset denormalized popularity + mined alias counts, then reapply.
    await tx.update(foodItems).set({ recipeCount: 0 });
    await tx.update(foodAliases).set({ useCount: 0 });

    // Rebuild the wholly-mined derived tables from scratch.
    await tx.delete(foodUnitStats);
    await tx.delete(foodPrepStats);
    await tx.delete(foodPairs);
    await tx.delete(userFoodPrefs);
    await tx.delete(foodRecipeLinks);
    await tx.delete(foodAliases).where(eq(foodAliases.source, "mined"));

    for (const node of mined.nodes) {
      await tx
        .update(foodItems)
        .set({ recipeCount: node.recipeCount, updatedAt: new Date() })
        .where(eq(foodItems.id, node.id));
    }

    for (const part of chunk(mined.unitStats, INSERT_CHUNK)) {
      await tx.insert(foodUnitStats).values(part);
    }
    for (const part of chunk(mined.prepStats, INSERT_CHUNK)) {
      await tx.insert(foodPrepStats).values(part);
    }
    for (const part of chunk(mined.pairs, INSERT_CHUNK)) {
      await tx.insert(foodPairs).values(part);
    }
    for (const part of chunk(mined.userPrefs, INSERT_CHUNK)) {
      await tx.insert(userFoodPrefs).values(part);
    }
    for (const part of chunk(mined.recipeLinks, INSERT_CHUNK)) {
      await tx.insert(foodRecipeLinks).values(part);
    }

    // Mined aliases upsert onto their node: a phrasing that matches a curated
    // alias bumps that row's count. A new phrasing inserts as `source = 'mined'`.
    for (const alias of mined.aliases) {
      await tx
        .insert(foodAliases)
        .values({
          id: `alias_${stableHash(`${alias.foodId}\u0000${alias.alias}`)}`,
          foodId: alias.foodId,
          alias: alias.alias,
          source: "mined",
          useCount: alias.useCount,
        })
        .onConflictDoUpdate({
          target: [foodAliases.foodId, foodAliases.alias],
          set: {
            useCount: sql`${foodAliases.useCount} + ${alias.useCount}`,
            updatedAt: new Date(),
          },
        });
    }
  });

  return {
    ingredientsScanned: rows.length,
    nodesTouched: mined.nodes.length,
    aliases: mined.aliases.length,
    unitStats: mined.unitStats.length,
    prepStats: mined.prepStats.length,
    pairs: mined.pairs.length,
    userPrefs: mined.userPrefs.length,
    recipeLinks: mined.recipeLinks.length,
  };
}
