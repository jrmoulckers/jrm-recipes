import { index, pgTable, real, varchar } from "drizzle-orm/pg-core";

import { pk, timestamps } from "./_shared";

/**
 * Food / ingredient reference table (issue: interchangeable units). A DB mirror
 * of the curated static dataset in `src/lib/food-db.ts`, seeded from it by
 * `src/server/db/seed-ingredients.ts`. The recipe editor's unit picker reads the
 * static module directly (so its suggestions stay synchronous + client-safe);
 * this table exists so *server-side* features (analytics, shopping-list
 * categorization, admin curation) can query the same taxonomy without shipping
 * the whole dataset to the client.
 *
 * `slug` is the stable, unique key derived from the food's name (also the seed
 * row id source), so re-seeding upserts in place. `category` holds a canonical
 * {@link FoodCategory} string; `densityGPerMl` is the approximate weigh-by
 * density (grams per millilitre) or NULL when the food is measured by
 * count/weight.
 */
export const foodItems = pgTable(
  "food_items",
  {
    id: pk(),
    slug: varchar({ length: 80 }).notNull().unique(),
    name: varchar({ length: 120 }).notNull(),
    category: varchar({ length: 40 }).notNull(),
    densityGPerMl: real(),
    ...timestamps(),
  },
  (t) => [index("food_items_category_idx").on(t.category)],
);

export type FoodItemRow = typeof foodItems.$inferSelect;
export type NewFoodItem = typeof foodItems.$inferInsert;
