/**
 * Pure builder that turns the curated static food dataset (`src/lib/food-db.ts`)
 * into `food_items` rows for the seed. Kept free of `db`/`postgres`/`server-only`
 * (like `seed-library.ts`) so its shapes + invariants can be unit-tested without
 * a database. `seed.ts` feeds these rows into an idempotent upsert.
 *
 * Every row carries a stable, deterministic `slug` (and id) derived from the
 * food name, so re-running `pnpm db:seed` updates in place and row counts stay
 * constant.
 */
import { FOOD_ITEMS, normalizeFoodText } from "~/lib/food-db";
import type { NewFoodItem } from "./schema";

/** Deterministic prefix so seeded food ids are recognizable + collision-free. */
const FOOD_ID_PREFIX = "seed_food_";

/**
 * Slugify a food name into a stable, unique, URL-safe key: reuse the shared
 * normalizer (lowercase, strip accents/punctuation), then hyphenate. Bounded to
 * the `food_items.slug` column width (80).
 */
export function foodSlug(name: string): string {
  return normalizeFoodText(name).replace(/\s+/g, "-").slice(0, 80);
}

/**
 * Build the `food_items` rows from the static dataset. Ids are derived from the
 * slug so upserts are idempotent. Throws if two foods slugify to the same key
 * (a data error the seed should surface loudly rather than silently drop a row).
 */
export function buildFoodItemRows(): NewFoodItem[] {
  const seen = new Set<string>();
  return FOOD_ITEMS.map((food) => {
    const slug = foodSlug(food.name);
    if (seen.has(slug)) {
      throw new Error(`Duplicate food slug "${slug}" for "${food.name}"`);
    }
    seen.add(slug);
    return {
      id: `${FOOD_ID_PREFIX}${slug}`,
      slug,
      name: food.name,
      category: food.category,
      densityGPerMl: food.densityGPerMl ?? null,
    } satisfies NewFoodItem;
  });
}
