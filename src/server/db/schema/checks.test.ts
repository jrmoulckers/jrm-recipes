import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { ratings } from "./engagement";
import { recipeIngredients, recipeSteps, recipes } from "./recipes";
import { shoppingListItems } from "./shopping";

/**
 * Issue #150 — the schema must declare DB-level CHECK constraints (the rating
 * range and non-negative numeric fields) that mirror the Zod bounds, so a write
 * bypassing the recipe editor (seed, import, admin/raw SQL) cannot persist an
 * out-of-range value.
 *
 * The unit-test environment has no Postgres, so we assert the invariant at the
 * two places that make it real: the Drizzle table config (the source of truth
 * `db:generate` compiles into DDL) and the generated migration (which enforces
 * it on the live database, repairing legacy rows first).
 */

interface Expectation {
  label: string;
  table: PgTable;
  name: string;
  /** Substrings expected in the generated (snake_case) CHECK DDL. */
  contains: string[];
}

const expectations: Expectation[] = [
  {
    label: "rating value 1–5",
    table: ratings,
    name: "ratings_value_range_check",
    contains: ['"value"', "between 1 and 5"],
  },
  {
    label: "servings >= 1",
    table: recipes,
    name: "recipes_servings_check",
    contains: ['"servings"', ">= 1"],
  },
  {
    label: "prep minutes >= 0",
    table: recipes,
    name: "recipes_prep_minutes_check",
    contains: ['"prep_minutes"', ">= 0"],
  },
  {
    label: "cook minutes >= 0",
    table: recipes,
    name: "recipes_cook_minutes_check",
    contains: ['"cook_minutes"', ">= 0"],
  },
  {
    label: "total minutes >= 0",
    table: recipes,
    name: "recipes_total_minutes_check",
    contains: ['"total_minutes"', ">= 0"],
  },
  {
    label: "ingredient quantity >= 0",
    table: recipeIngredients,
    name: "recipe_ingredients_quantity_check",
    contains: ['"quantity"', ">= 0"],
  },
  {
    label: "ingredient quantity_max >= 0",
    table: recipeIngredients,
    name: "recipe_ingredients_quantity_max_check",
    contains: ['"quantity_max"', ">= 0"],
  },
  {
    label: "ingredient quantity_max >= quantity",
    table: recipeIngredients,
    name: "recipe_ingredients_quantity_range_check",
    contains: ['"quantity_max"', '"quantity"', "is null", ">="],
  },
  {
    label: "step timer >= 0",
    table: recipeSteps,
    name: "recipe_steps_timer_seconds_check",
    contains: ['"timer_seconds"', ">= 0"],
  },
  {
    label: "shopping quantity >= 0",
    table: shoppingListItems,
    name: "shopping_list_items_quantity_check",
    contains: ['"quantity"', ">= 0"],
  },
  {
    label: "shopping quantity_max >= 0",
    table: shoppingListItems,
    name: "shopping_list_items_quantity_max_check",
    contains: ['"quantity_max"', ">= 0"],
  },
  {
    label: "shopping quantity_max >= quantity",
    table: shoppingListItems,
    name: "shopping_list_items_quantity_range_check",
    contains: ['"quantity_max"', '"quantity"', "is null", ">="],
  },
];

/** Names of every CHECK declared on a table. */
function checkNames(table: PgTable): string[] {
  return getTableConfig(table).checks.map((c) => c.name);
}

describe("schema declares CHECK constraints (issue #150)", () => {
  it.each(expectations)("declares $name ($label)", ({ table, name }) => {
    expect(checkNames(table), `expected CHECK "${name}"`).toContain(name);
  });
});

// Vitest runs with the repo root as cwd; the migrations live in ./drizzle.
const drizzleDir = join(process.cwd(), "drizzle");
const migration = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ file: f, body: readFileSync(join(drizzleDir, f), "utf8") }))
  .find((m) => m.body.includes('ADD CONSTRAINT "ratings_value_range_check"'));

describe("CHECK-constraint migration (issue #150)", () => {
  it("exists as a generated migration", () => {
    expect(migration, "no migration adds the rating range check").toBeDefined();
  });

  it.each(expectations)(
    "adds $name with the right predicate",
    ({ name, contains }) => {
      const body = migration?.body ?? "";
      const marker = `ADD CONSTRAINT "${name}" CHECK (`;
      const start = body.indexOf(marker);
      expect(start, `missing ADD CONSTRAINT for "${name}"`).toBeGreaterThan(-1);
      // Isolate this constraint's own CHECK(...) clause before asserting columns.
      const clause = body.slice(start, body.indexOf(");", start));
      for (const needle of contains) {
        expect(clause).toContain(needle);
      }
    },
  );

  it("repairs existing rows before adding any constraint", () => {
    const body = migration?.body ?? "";
    const firstRepair = body.indexOf('UPDATE "');
    const firstConstraint = body.indexOf('ADD CONSTRAINT "');
    expect(firstRepair).toBeGreaterThanOrEqual(0);
    expect(firstConstraint).toBeGreaterThan(firstRepair);
  });

  it("clamps out-of-range ratings into the 1–5 window", () => {
    // GREATEST/LEAST keeps the nearest valid star instead of dropping the row.
    expect(migration?.body).toMatch(
      /UPDATE "ratings" SET "value" = LEAST\(GREATEST\("value", 1\), 5\)/,
    );
  });

  it.each([
    "recipe_ingredients",
    "recipe_steps",
    "recipes",
    "shopping_list_items",
  ])("repairs %s before constraining it", (table) => {
    expect(migration?.body).toContain(`UPDATE "${table}"`);
  });
});
