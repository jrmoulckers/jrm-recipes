/**
 * E2E-only fixture seed (issue #783).
 *
 * The multi-identity harness (#698) needs a second person to exist *before* any
 * test runs, because the co-creation flow invites by handle and an invite can
 * only name a user who is already there. #698 met that need by pointing the
 * second identity at the demo seed's `Aunt Rosa`, which put a test fixture into
 * every dev, demo and preview database and — worse — gave the fixture somebody
 * else's ratings, comments and suggestions to inherit.
 *
 * So the fixture lives here instead, and this script is invoked only by the CI
 * E2E job. `pnpm db:seed` neither creates nor requires it.
 *
 * Idempotent: safe to run against a database that has already been seeded, and
 * safe to run twice in the same job.
 *
 * Deliberately creates **no** `recipe_creators` rows. Every co-creation test
 * must reach that state through the product's own invite and accept flow; a
 * fixture that pre-creates the relationship would let the tests pass while the
 * flow under test was broken.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DEV_CO_COOK, isE2eIdentity } from "~/server/auth/dev-user";
import * as schema from "~/server/db/schema";
import { users } from "~/server/db/schema";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "db:seed:e2e requires DATABASE_URL (or DATABASE_URL_UNPOOLED / " +
      "POSTGRES_URL_NON_POOLING) to be set.",
  );
}

async function main() {
  // Belt and braces: this script exists precisely to keep non-E2E identities
  // out of it, so refuse rather than trust that the constant still qualifies.
  if (!isE2eIdentity(DEV_CO_COOK)) {
    throw new Error(
      `Refusing to seed ${DEV_CO_COOK.id}: it is not an E2E-only identity. ` +
        "A fixture must not share an id with a demo persona (issue #783).",
    );
  }

  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await db
      .insert(users)
      .values({
        id: DEV_CO_COOK.id,
        email: DEV_CO_COOK.email,
        name: DEV_CO_COOK.name,
        handle: DEV_CO_COOK.handle,
        slug: DEV_CO_COOK.slug,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: DEV_CO_COOK.email, name: DEV_CO_COOK.name },
      });

    console.log(
      `Seeded E2E identity ${DEV_CO_COOK.handle} (${DEV_CO_COOK.id}). ` +
        "No recipe_creators rows created — tests must use the invite flow.",
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
