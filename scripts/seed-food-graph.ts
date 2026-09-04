/**
 * Production-safe seed for the canonical food graph ONLY.
 *
 * `pnpm db:seed` runs the full *demo* dataset (demo users, groups, recipes,
 * engagement) and is therefore unsafe to run against production. The curated
 * food reference tables: `food_items` (with `allergens` + `density_g_per_ml`),
 * `food_aliases`, and `food_nutrition`. They power structured allergens,
 * nutrition auto-compute, and ingredient→food resolution, and live inside that
 * demo seed as `seedFoodItems`. This script performs exactly those upserts and
 * nothing else, so it can be run against a live database to (re)populate the
 * food graph without touching any member data.
 *
 * Idempotent: ids/slugs are deterministic and every write is an
 * `onConflictDoUpdate`, so re-running refreshes rows in place and row counts
 * stay constant. Reuses the same exported builders (`~/server/db/seed-ingredients`)
 * as the demo seed, so the two can never drift.
 *
 * Usage:
 *   pnpm db:seed-food-graph          # upsert against DATABASE_URL(_UNPOOLED)
 *   pnpm db:seed-food-graph --dry    # print what would be written, touch nothing
 *
 * Connection: prefers a direct (non-pooled) URL for the DML, mirroring
 * `scripts/seed.ts` / `scripts/backfill-food-links.ts`.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  buildFoodAliasRows,
  buildFoodItemRows,
  buildFoodNutrientRows,
  buildFoodNutritionRows,
  buildFoodPortionRows,
  buildNutrientRows,
} from '~/server/db/seed-ingredients';
import {
  foodAliases,
  foodItems,
  foodNutrients,
  foodNutrition,
  foodPortions,
  nutrients,
} from '~/server/db/schema';
import * as schema from '~/server/db/schema';

const dryRun = process.argv.includes('--dry');

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

async function main() {
  const itemRows = buildFoodItemRows();
  const aliasRows = buildFoodAliasRows();
  const nutritionRows = buildFoodNutritionRows();
  const nutrientRows = buildNutrientRows();
  const foodNutrientRows = buildFoodNutrientRows();
  const portionRows = buildFoodPortionRows();
  const withAllergens = itemRows.filter((r) => (r.allergens?.length ?? 0) > 0).length;

  console.log(
    `[seed-food-graph] Prepared ${itemRows.length} food item(s) ` +
      `(${withAllergens} with allergens), ${aliasRows.length} alias(es), ` +
      `${nutritionRows.length} nutrition row(s), ${nutrientRows.length} nutrient(s), ` +
      `${foodNutrientRows.length} food-nutrient value(s), ${portionRows.length} portion(s).`,
  );

  if (dryRun) {
    console.log('[seed-food-graph] --dry: no database writes performed.');
    return;
  }

  if (!url) {
    console.error(
      '[seed-food-graph] No database URL set. Provide DATABASE_URL (or ' +
        'DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING). See .env.example.',
    );
    process.exit(1);
  }

  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  try {
    await db.transaction(async (tx) => {
      for (const row of itemRows) {
        await tx
          .insert(foodItems)
          .values(row)
          .onConflictDoUpdate({
            target: foodItems.id,
            set: {
              slug: row.slug,
              name: row.name,
              category: row.category,
              densityGPerMl: row.densityGPerMl ?? null,
              allergens: row.allergens ?? null,
              updatedAt: new Date(),
            },
          });
      }
      for (const row of aliasRows) {
        await tx
          .insert(foodAliases)
          .values(row)
          .onConflictDoUpdate({
            target: foodAliases.id,
            set: {
              foodId: row.foodId,
              alias: row.alias,
              updatedAt: new Date(),
            },
          });
      }
      for (const row of nutritionRows) {
        await tx
          .insert(foodNutrition)
          .values(row)
          .onConflictDoUpdate({
            target: foodNutrition.foodId,
            set: {
              sourceRef: row.sourceRef,
              updatedAt: new Date(),
            },
          });
      }
      for (const row of nutrientRows) {
        await tx
          .insert(nutrients)
          .values(row)
          .onConflictDoUpdate({
            target: nutrients.id,
            set: {
              label: row.label,
              unit: row.unit,
              dailyValue: row.dailyValue ?? null,
              displayPrecision: row.displayPrecision,
              displayOrder: row.displayOrder,
              isMacro: row.isMacro,
              updatedAt: new Date(),
            },
          });
      }
      for (const row of foodNutrientRows) {
        await tx
          .insert(foodNutrients)
          .values(row)
          .onConflictDoUpdate({
            target: [foodNutrients.foodId, foodNutrients.nutrientId],
            set: { per100g: row.per100g, updatedAt: new Date() },
          });
      }
      for (const row of portionRows) {
        await tx
          .insert(foodPortions)
          .values(row)
          .onConflictDoUpdate({
            target: [foodPortions.foodId, foodPortions.unit],
            set: {
              gramsPerUnit: row.gramsPerUnit,
              modifier: row.modifier ?? null,
              source: row.source,
              updatedAt: new Date(),
            },
          });
      }
    });

    console.log(
      `[seed-food-graph] Upserted ${itemRows.length} food item(s), ` +
        `${aliasRows.length} alias(es), ${nutritionRows.length} nutrition row(s), ` +
        `${nutrientRows.length} nutrient(s), ${foodNutrientRows.length} food-nutrient value(s), ` +
        `${portionRows.length} portion(s).`,
    );
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[seed-food-graph] Failed:', error);
    process.exit(1);
  });
