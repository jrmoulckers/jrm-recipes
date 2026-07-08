import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the hand-augmented parts of the eng-data batch migration (0011). The
 * generator can add columns/constraints, but only these hand-written repairs make
 * the deploy safe on legacy data: dedupe before a UNIQUE, cast text->jsonb with a
 * USING clause, and backfill the rating aggregates before their CHECKs. It also
 * pins the full-text-search objects that are provisioned outside the Drizzle
 * schema. Asserted against the generated SQL text (no Postgres in unit tests).
 */

// Vitest runs with the repo root as cwd; the migrations live in ./drizzle.
const drizzleDir = join(process.cwd(), "drizzle");
const migration = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ file: f, body: readFileSync(join(drizzleDir, f), "utf8") }))
  .find((m) =>
    m.body.includes('ADD CONSTRAINT "recipe_versions_recipe_version_uq"'),
  );

const body = migration?.body ?? "";

describe("eng-data batch migration repairs legacy data before constraining it", () => {
  it("exists as a single generated migration", () => {
    expect(migration, "no migration adds the version unique constraint").toBeDefined();
  });

  it("#151 de-duplicates version numbers before adding the UNIQUE constraint", () => {
    const dedupe = body.indexOf('UPDATE "recipe_versions" v SET "version_number"');
    const unique = body.indexOf(
      'ADD CONSTRAINT "recipe_versions_recipe_version_uq"',
    );
    expect(dedupe).toBeGreaterThanOrEqual(0);
    expect(unique).toBeGreaterThan(dedupe);
  });

  it("#170 repairs empty snapshots and casts text->jsonb with a USING clause", () => {
    const repair = body.indexOf(
      `UPDATE "recipe_versions" SET "snapshot" = '{}'`,
    );
    const cast = body.indexOf(
      'SET DATA TYPE jsonb USING "snapshot"::jsonb',
    );
    // A bare `SET DATA TYPE jsonb` would fail (no implicit text->jsonb cast).
    expect(cast).toBeGreaterThan(-1);
    expect(repair).toBeGreaterThanOrEqual(0);
    expect(cast).toBeGreaterThan(repair);
  });

  it("#154 backfills owner-excluded rating aggregates before the CHECKs", () => {
    const backfill = body.indexOf('UPDATE "recipes" r SET "rating_count"');
    const countCheck = body.indexOf(
      'ADD CONSTRAINT "recipes_rating_count_check"',
    );
    const sumCheck = body.indexOf('ADD CONSTRAINT "recipes_rating_sum_check"');
    expect(backfill).toBeGreaterThanOrEqual(0);
    // Self-ratings by the author are excluded from the denormalized totals.
    expect(body).toContain('WHERE rt."user_id" <> rc."author_id"');
    expect(countCheck).toBeGreaterThan(backfill);
    expect(sumCheck).toBeGreaterThan(backfill);
  });
});

describe("eng-data batch migration provisions full-text search (issue #158)", () => {
  it("enables pg_trgm idempotently", () => {
    expect(body).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  });

  it("adds a generated, STORED search_vector weighted title>description>cuisine", () => {
    expect(body).toMatch(
      /ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS/,
    );
    expect(body).toContain(
      `setweight(to_tsvector('english', coalesce("title", '')), 'A')`,
    );
    expect(body).toContain(
      `setweight(to_tsvector('english', coalesce("description", '')), 'B')`,
    );
    expect(body).toContain(
      `setweight(to_tsvector('english', coalesce("cuisine", '')), 'C')`,
    );
    expect(body).toContain("STORED");
  });

  it("indexes the vector with GIN and adds trigram GIN indexes for fallbacks", () => {
    expect(body).toContain('USING gin ("search_vector")');
    expect(body).toContain('USING gin ("item" gin_trgm_ops)');
    expect(body).toContain('USING gin ("name" gin_trgm_ops)');
  });
});
