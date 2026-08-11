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
import { FOOD_ITEMS, foodNodeId, foodSlug, normalizeFoodText, stableHash } from '~/lib/food-db';
import { foodAllergensForSlug } from '~/lib/food-allergens';
import { NUTRITION_BY_SLUG } from '~/lib/food-nutrition';
import type { NewFoodAlias, NewFoodItem, NewFoodNutrition } from './schema';

/** Re-exported so the seed's slug helper has one source of truth (`food-db`). */
export { foodSlug };

/**
 * Build the `food_items` rows from the static dataset. Ids are derived from the
 * slug so upserts are idempotent. Throws if two foods slugify to the same key
 * (a data error the seed should surface loudly rather than silently drop a row).
 * Seeded rows are `source = 'curated'`. The graph miner later adds `'mined'`
 * rows/stats onto the same nodes.
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
      id: foodNodeId(food.name),
      slug,
      name: food.name,
      category: food.category,
      densityGPerMl: food.densityGPerMl ?? null,
      allergens: foodAllergensForSlug(slug),
      source: 'curated',
    } satisfies NewFoodItem;
  });
}

/**
 * Build the curated `food_aliases` rows from the static dataset: every food's
 * name plus its match phrases, normalized and de-duplicated per node. These seed
 * the alias table (`source = 'curated'`) so free-text resolution works before
 * any corpus mining has run. The miner later layers `'mined'` phrasings on top.
 * Ids are a deterministic hash of (nodeId, alias) so re-seeding upserts in place.
 */
export function buildFoodAliasRows(): NewFoodAlias[] {
  const seen = new Set<string>();
  const rows: NewFoodAlias[] = [];
  for (const food of FOOD_ITEMS) {
    const foodId = foodNodeId(food.name);
    const phrases = new Set<string>();
    for (const phrase of [food.name, ...food.aliases]) {
      const alias = normalizeFoodText(phrase).slice(0, 160);
      if (alias) phrases.add(alias);
    }
    for (const alias of phrases) {
      const key = `${foodId}\u0000${alias}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: `alias_${stableHash(key)}`,
        foodId,
        alias,
        source: 'curated',
        useCount: 0,
      } satisfies NewFoodAlias);
    }
  }
  return rows;
}

/**
 * Build the curated `food_nutrition` rows from the static dataset
 * (`src/lib/food-nutrition.ts`). Keyed by the same slug/id as `food_items`, so
 * each row's `foodId` points at the node the food seed created. Only foods with
 * curated facts get a row (partial coverage is expected). Idempotent: the PK is
 * the node id, so re-seeding upserts in place.
 */
export function buildFoodNutritionRows(): NewFoodNutrition[] {
  const rows: NewFoodNutrition[] = [];
  for (const food of FOOD_ITEMS) {
    const facts = NUTRITION_BY_SLUG.get(foodSlug(food.name));
    if (!facts) continue;
    rows.push({
      foodId: foodNodeId(food.name),
      kcal: facts.kcal,
      proteinG: facts.proteinG,
      carbsG: facts.carbsG,
      fatG: facts.fatG,
      fiberG: facts.fiberG ?? null,
      sugarG: facts.sugarG ?? null,
      sodiumMg: facts.sodiumMg ?? null,
      sourceRef: facts.sourceRef,
    } satisfies NewFoodNutrition);
  }
  return rows;
}
