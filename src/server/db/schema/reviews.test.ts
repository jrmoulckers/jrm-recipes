import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { reviews } from "./reviews";

/**
 * Issue #174 — first-class recipe reviews. The table is the source of truth, so
 * we assert its shape (columns, one-per-user uniqueness, FK cover indexes and
 * the star-range CHECK) against the compiled Drizzle config rather than the
 * generated SQL.
 */
describe("reviews table (issue #174)", () => {
  const { columns, uniqueConstraints, indexes, checks, foreignKeys } =
    getTableConfig(reviews);
  const col = (name: string) => columns.find((c) => c.name === name);

  it("has the expected columns", () => {
    for (const name of [
      "id",
      "recipeId",
      "userId",
      "rating",
      "title",
      "body",
      "editedAt",
      "createdAt",
      "updatedAt",
    ]) {
      expect(col(name), `expected a ${name} column`).toBeDefined();
    }
  });

  it("stores rating as a NOT NULL integer", () => {
    expect(col("rating")?.getSQLType()).toBe("integer");
    expect(col("rating")?.notNull).toBe(true);
  });

  it("keeps title/body/editedAt nullable (a review can be rating-only)", () => {
    expect(col("title")?.notNull).toBe(false);
    expect(col("body")?.notNull).toBe(false);
    expect(col("editedAt")?.notNull).toBe(false);
  });

  it("enforces one review per user per recipe", () => {
    const uq = uniqueConstraints.find(
      (u) => u.name === "reviews_recipe_user_uq",
    );
    expect(uq, "expected reviews_recipe_user_uq").toBeDefined();
    expect(uq?.columns.map((c) => c.name)).toEqual(["recipeId", "userId"]);
  });

  it("covers both foreign keys with an index", () => {
    for (const name of ["reviews_recipe_idx", "reviews_user_idx"]) {
      expect(
        indexes.some((i) => i.config.name === name),
        `expected index ${name}`,
      ).toBe(true);
    }
  });

  it("cascades when the parent recipe or user is deleted", () => {
    for (const fk of foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
    expect(foreignKeys).toHaveLength(2);
  });

  it("guards the 1–5 star range with a CHECK", () => {
    expect(
      checks.some((c) => c.name === "reviews_rating_range_check"),
      "expected reviews_rating_range_check",
    ).toBe(true);
  });
});
