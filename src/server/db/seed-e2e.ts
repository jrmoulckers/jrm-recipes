/**
 * End-to-end identity fixtures (issue #698).
 *
 * Separate from `pnpm db:seed` on purpose. The dev-bypass identity selector can
 * only resolve to a key of `E2E_IDENTITIES`, and these are the rows behind those
 * keys — so keeping them out of the demo seed means they exist in no dev, demo,
 * preview or production database. That is the fourth of the four independent
 * barriers documented on `E2E_IDENTITIES` in `~/server/auth/dev-user`: even if
 * the first three were somehow defeated, the identities would name nothing.
 *
 * Only CI's `e2e` job runs this, after `pnpm db:seed`.
 *
 * What it creates:
 *   - the two fixture cooks, with distinct `users.slug` values, which is what
 *     lets a spec drive two genuinely different people;
 *   - one published, public recipe owned by the `owner` fixture.
 *
 * It deliberately creates **no** `recipe_creators` rows. The co-creation
 * lifecycle is what the spec exercises through the UI, so seeding any part of
 * it would be seeding the thing under test.
 *
 * Idempotent, like the demo seed: stable natural keys, upserted, so re-running
 * updates in place. Child collections are rebuilt so row counts stay constant.
 *
 * Run it:
 *   DATABASE_URL="postgres://…" pnpm db:seed:e2e
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "~/server/db/schema";
import {
  recipeCreators,
  recipeIngredients,
  recipeSteps,
  recipes,
  users,
} from "~/server/db/schema";
import { E2E_IDENTITIES } from "~/server/auth/dev-user";

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.error(
    "No database URL set. Provide DATABASE_URL (or DATABASE_URL_UNPOOLED / " +
      "POSTGRES_URL_NON_POOLING). See .env.example.",
  );
  process.exit(1);
}

const client = postgres(url, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const db = drizzle(client, { schema, casing: "snake_case" });

/**
 * The recipe the co-creator journey runs against.
 *
 * Owned by the `owner` fixture, so the mirror namespace under the co-creator's
 * slug only ever exists because the spec created it.
 */
export const E2E_RECIPE = {
  id: "e2e_rcp_cocreation_00000",
  slug: "shared-supper-loaf",
  title: "Shared Supper Loaf",
  description:
    "A plain loaf that exists so two cooks can be seen editing the same recipe.",
  servings: 6,
  prepMinutes: 15,
  cookMinutes: 45,
} as const;

/** The body text the spec asserts is visible under both namespaces. */
export const E2E_RECIPE_ORIGINAL_STEP = "Heat the oven to 200C.";

async function main(): Promise<void> {
  console.log("Seeding Heirloom e2e identity fixtures…");

  await db.transaction(async (tx) => {
    for (const user of Object.values(E2E_IDENTITIES)) {
      await tx
        .insert(users)
        .values({
          id: user.id,
          email: user.email,
          name: user.name,
          handle: user.handle,
          slug: user.slug,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: user.email,
            name: user.name,
            handle: user.handle,
            slug: user.slug,
            // A prior run of the co-creator spec may have exercised erasure or
            // left the row soft-deleted. Revive it so the suite is re-runnable
            // against a database that is not thrown away.
            deletedAt: null,
          },
        });
    }

    const created = new Date();
    const row = {
      id: E2E_RECIPE.id,
      slug: E2E_RECIPE.slug,
      title: E2E_RECIPE.title,
      description: E2E_RECIPE.description,
      authorId: E2E_IDENTITIES.owner.id,
      visibility: "public" as const,
      status: "published" as const,
      servings: E2E_RECIPE.servings,
      servingsNoun: "servings",
      prepMinutes: E2E_RECIPE.prepMinutes,
      cookMinutes: E2E_RECIPE.cookMinutes,
      totalMinutes: E2E_RECIPE.prepMinutes + E2E_RECIPE.cookMinutes,
      publishedAt: created,
      updatedAt: created,
      deletedAt: null,
    };
    const { id: _id, ...mutable } = row;
    await tx
      .insert(recipes)
      .values(row)
      .onConflictDoUpdate({ target: recipes.id, set: mutable });

    await tx
      .delete(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, E2E_RECIPE.id));
    await tx.insert(recipeIngredients).values([
      {
        recipeId: E2E_RECIPE.id,
        position: 0,
        quantity: 500,
        unit: "g",
        item: "flour",
      },
      {
        recipeId: E2E_RECIPE.id,
        position: 1,
        quantity: 350,
        unit: "ml",
        item: "water",
      },
      {
        recipeId: E2E_RECIPE.id,
        position: 2,
        quantity: 10,
        unit: "g",
        item: "salt",
      },
    ]);

    await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, E2E_RECIPE.id));
    await tx.insert(recipeSteps).values([
      {
        recipeId: E2E_RECIPE.id,
        position: 0,
        instruction: E2E_RECIPE_ORIGINAL_STEP,
      },
      {
        recipeId: E2E_RECIPE.id,
        position: 1,
        instruction: "Mix, rest, shape, and bake until it sounds hollow.",
      },
    ]);

    // Start from "nobody has been invited". The spec drives the whole
    // absent → pending → accepted → removed lifecycle through the UI, so any
    // row left behind by a previous run is a precondition it did not set — and
    // the first assertion, that a pending invitation grants nothing, would pass
    // or fail for the wrong reason.
    await tx
      .delete(recipeCreators)
      .where(eq(recipeCreators.recipeId, E2E_RECIPE.id));
  });

  console.log(
    `  ${Object.keys(E2E_IDENTITIES).length} fixture cooks ` +
      `(${Object.values(E2E_IDENTITIES)
        .map((u) => u.slug)
        .join(", ")})`,
  );
  console.log(
    `  1 recipe (${E2E_RECIPE.slug}) owned by ${E2E_IDENTITIES.owner.slug}`,
  );
  console.log(
    "  0 recipe_creators rows: the spec creates those through the UI",
  );

  await client.end();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("E2E seed failed:", error);
  await client.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
});
