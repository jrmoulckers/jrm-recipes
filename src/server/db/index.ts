import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Lazy Postgres client.
 *
 * We build the connection on first query (not at import) so the app can boot,
 * render the landing page, and switch themes with NO database configured.
 * Pages that actually need data will surface a clear error if DATABASE_URL is
 * missing. In dev we cache the connection across HMR reloads.
 */
const globalForDb = globalThis as unknown as {
  conn?: postgres.Sql;
};

export function isDbConfigured() {
  return Boolean(env.DATABASE_URL);
}

let cached: PostgresJsDatabase<typeof schema> | undefined;

function createDb(): PostgresJsDatabase<typeof schema> {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your .env (see .env.example) or " +
        "run `docker compose up -d` for a local Postgres.",
    );
  }
  const conn =
    globalForDb.conn ??
    postgres(env.DATABASE_URL, {
      // Required for Neon / PgBouncer transaction pooling.
      prepare: false,
      max: env.NODE_ENV === "production" ? 1 : 5,
    });
  if (env.NODE_ENV !== "production") globalForDb.conn = conn;
  return drizzle(conn, { schema, casing: "snake_case" });
}

function getDb(): PostgresJsDatabase<typeof schema> {
  cached ??= createDb();
  return cached;
}

/** Drizzle database handle. Access triggers a lazy connection. */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});

export { schema };
