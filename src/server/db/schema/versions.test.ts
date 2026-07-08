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
