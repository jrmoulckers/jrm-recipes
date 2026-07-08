import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { recipes } from "./recipes";

/**
 * Issue #165 — a hard delete cascades away a recipe's whole history. `recipes`
 * gains soft-delete + audit columns and keeps its hot lookup indexes partial on
 * the active rows so tombstones never bloat an active-recipe scan. Asserted at
 * the schema source of truth that `db:generate` compiles into DDL.
 */
describe("recipes soft-delete schema (issue #165)", () => {
  const { columns, indexes } = getTableConfig(recipes);

  it("adds nullable deleted_at + deleted_by audit columns", () => {
    const deletedAt = columns.find((c) => c.name === "deletedAt");
    const deletedBy = columns.find((c) => c.name === "deletedBy");

    expect(deletedAt, "expected a deleted_at column").toBeDefined();
    expect(deletedAt?.getSQLType()).toContain("timestamp");
    expect(deletedAt?.notNull, "deleted_at must be nullable").toBe(false);

    expect(deletedBy, "expected a deleted_by column").toBeDefined();
    expect(deletedBy?.notNull, "deleted_by must be nullable").toBe(false);
  });

  it("keeps the active-recipe lookup indexes partial (WHERE deleted_at IS NULL)", () => {
    for (const name of [
      "recipes_author_idx",
      "recipes_group_idx",
      "recipes_visibility_idx",
    ]) {
      const idx = indexes.find((i) => i.config.name === name);
      expect(idx, `expected index "${name}"`).toBeDefined();
      expect(idx?.config.where, `"${name}" should be a partial index`).toBeDefined();
    }
  });
});
