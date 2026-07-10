import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { recipes } from "./recipes";

/**
 * Issue #154 — recipes carries denormalized, owner-excluded rating aggregates
 * (`ratingCount` + `ratingSum`) so list/feed cards and the top-rated ordering
 * read a count + average straight off the row instead of scanning `ratings`.
 *
 * No Postgres in unit tests, so we assert the invariants where they become real:
 * the Drizzle table config that `db:generate` compiles into DDL. Column names
 * come back as the camelCase JS keys here; snake_case is applied at generate time.
 */
describe("recipes rating aggregate columns (issue #154)", () => {
  const { columns, checks } = getTableConfig(recipes);
  const byName = (name: string) => columns.find((c) => c.name === name);

  it.each(["ratingCount", "ratingSum"])(
    "declares %s as NOT NULL defaulting to 0",
    (name) => {
      const col = byName(name);
      expect(col, `expected recipes.${name}`).toBeDefined();
      // A denormalized counter must never be null and must start at zero so a
      // freshly inserted recipe reads as "unrated", not NaN.
      expect(col!.notNull).toBe(true);
      expect(col!.hasDefault).toBe(true);
      expect(col!.default).toBe(0);
    },
  );

  it.each(["recipes_rating_count_check", "recipes_rating_sum_check"])(
    "guards %s against going negative",
    (name) => {
      expect(checks.map((c) => c.name)).toContain(name);
    },
  );
});
