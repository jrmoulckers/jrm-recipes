/**
 * One-off backfill: populate `recipes.dietary_tags` for existing recipes.
 *
 * The derived dietary tags (issue #273) are computed on every write by
 * `deriveDietaryTags` (see `src/lib/dietary-derive.ts`), but recipes created
 * before this feature have a NULL `dietary_tags`. This script reads each
 * recipe's ingredient item text, recomputes the three detectable "-free" tags
 * (dairy-free / gluten-free / egg-free), and writes them. vegan/vegetarian are
 * never touched here — they live in the author-declared `dietary_flags`.
 *
 * Idempotent: re-running recomputes the same values (only writes when they
 * differ). Run with `pnpm db:backfill-dietary`.
 *
 * Connection: prefers a direct (non-pooled) URL for the DML, mirroring
 * `scripts/migrate.mjs` and `scripts/backfill-tag-taxonomy.ts`.
 */
import postgres from "postgres";

import { deriveDietaryTags } from "../src/lib/dietary-derive";

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.log("[backfill-dietary] No database URL set — nothing to do.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

type RecipeRow = { id: string; dietary_tags: string[] | null };
type IngredientRow = { recipe_id: string; item: string };

/** Order-insensitive equality for two tag lists. */
function sameTags(a: string[] | null, b: string[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  const set = new Set(left);
  return b.every((t) => set.has(t));
}

async function main() {
  const recipes = await sql<RecipeRow[]>`
    SELECT id, dietary_tags FROM recipes
  `;

  // Pull every ingredient item once and group by recipe, so derivation runs
  // over the same text the write path sees.
  const ingredients = await sql<IngredientRow[]>`
    SELECT recipe_id, item FROM recipe_ingredients ORDER BY recipe_id, position
  `;
  const itemsByRecipe = new Map<string, string[]>();
  for (const { recipe_id, item } of ingredients) {
    const list = itemsByRecipe.get(recipe_id) ?? [];
    list.push(item);
    itemsByRecipe.set(recipe_id, list);
  }

  let updated = 0;
  for (const recipe of recipes) {
    const derived = deriveDietaryTags(itemsByRecipe.get(recipe.id) ?? []);
    if (sameTags(recipe.dietary_tags, derived)) continue;
    // Store NULL (not an empty array) when nothing is derivable, matching the
    // write path's `length > 0 ? tags : null`.
    const value = derived.length > 0 ? derived : null;
    await sql`
      UPDATE recipes SET dietary_tags = ${value} WHERE id = ${recipe.id}
    `;
    updated++;
  }

  console.log(
    `[backfill-dietary] Scanned ${recipes.length} recipe(s); updated ${updated}.`,
  );
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("[backfill-dietary] Failed:", error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
