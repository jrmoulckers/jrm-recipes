import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { recipeVersions } from "./recipes";

/**
 * Issue #170 — `recipe_versions.snapshot` must be stored as `jsonb`, not `text`,
 * so Postgres validates the JSON structurally and future timeline/diff features
 * can query inside a snapshot. Asserted at the schema source of truth.
 */
describe("recipe_versions.snapshot column (issue #170)", () => {
  it("is a jsonb column", () => {
    const snapshot = getTableConfig(recipeVersions).columns.find(
      (c) => c.name === "snapshot",
    );
    expect(snapshot, "expected a snapshot column").toBeDefined();
    expect(snapshot?.getSQLType()).toBe("jsonb");
    expect(snapshot?.notNull).toBe(true);
  });
});

/**
 * Issue #151 — `(recipe_id, version_number)` is unique at the database level so
 * two concurrent edits can't both claim the same version number. The btree the
 * constraint creates also serves the version-ordered history reads that the old
 * non-unique `recipe_versions_recipe_idx` index used to back.
 */
describe("recipe_versions version-number uniqueness (issue #151)", () => {
  it("has a unique constraint on (recipe_id, version_number)", () => {
    const { uniqueConstraints } = getTableConfig(recipeVersions);
    const uq = uniqueConstraints.find(
      (u) => u.name === "recipe_versions_recipe_version_uq",
    );
    expect(uq, "expected a unique constraint").toBeDefined();
    expect(uq?.columns.map((c) => c.name)).toEqual([
      "recipeId",
      "versionNumber",
    ]);
  });

  it("no longer declares the redundant non-unique recipe index", () => {
    const { indexes } = getTableConfig(recipeVersions);
    expect(
      indexes.some((i) => i.config.name === "recipe_versions_recipe_idx"),
    ).toBe(false);
  });
});
