import { and, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Building the free-text (FTS + synonym fallback) predicate calls `db.select`
// for its EXISTS subqueries, so a bare `{}` stub isn't enough here. A real
// (query-only) Drizzle instance renders the SQL without ever connecting — the
// postgres client dials lazily on first query, which these tests never trigger.
const { fakeDb } = await vi.hoisted(async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const client = postgres("postgres://user:pass@localhost:5432/db", { max: 1 });
  return { fakeDb: drizzle(client, { casing: "snake_case" }) };
});

vi.mock("~/server/db", () => ({ db: fakeDb, isDbConfigured: () => true }));

import { parseRecipeSearch } from "./search";
import { recipeUsesFoodConditionSql, searchFilterConditions } from "./queries";

const dialect = new PgDialect({ casing: "snake_case" });
const render = (fragment: SQL) => {
  const { sql, params } = dialect.sqlToQuery(fragment);
  return { sql: sql.toLowerCase(), params };
};
const renderAll = (conditions: SQL[]): string => {
  const combined = and(...conditions);
  return combined ? render(combined).sql : "";
};

describe("recipeUsesFoodConditionSql — ingredient → recipe join", () => {
  it("matches on the write-time link AND the mined reverse index", () => {
    const { sql, params } = render(recipeUsesFoodConditionSql("food_tomato"));
    // Primary path: the structured ingredient-line FK.
    expect(sql).toContain("recipe_ingredients");
    expect(sql).toContain("food_id");
    // Secondary path: the reverse food→recipe index.
    expect(sql).toContain("food_recipe_links");
    // Both correlate to the outer recipe row and OR together.
    expect(sql).toContain(" or ");
    expect(sql.match(/exists/g) ?? []).toHaveLength(2);
    // The resolved id is a bound parameter, never interpolated.
    expect(params).toEqual(["food_tomato", "food_tomato"]);
  });
});

describe("searchFilterConditions — ingredient filter (#food-graph)", () => {
  it("adds no ingredient predicate when the filter is absent (undefined)", () => {
    const search = parseRecipeSearch({ cuisine: "Thai" });
    const sql = renderAll(searchFilterConditions(search));
    expect(sql).not.toContain("food_recipe_links");
  });

  it("constrains to recipes using the resolved food when it resolves", () => {
    const search = parseRecipeSearch({ ingredient: "tofu" });
    const conditions = searchFilterConditions(search, {
      ingredientFoodId: "food_tofu",
    });
    expect(conditions).toHaveLength(1);
    const sql = renderAll(conditions);
    expect(sql).toContain("recipe_ingredients");
    expect(sql).toContain("food_recipe_links");
  });

  it("forces an empty result when the term resolves to no known food (null)", () => {
    // A requested-but-unresolvable ingredient must not silently no-op — it
    // should yield nothing rather than every recipe.
    const search = parseRecipeSearch({ ingredient: "asdfqwer" });
    const sql = renderAll(
      searchFilterConditions(search, { ingredientFoodId: null }),
    );
    expect(sql).toContain("false");
    expect(sql).not.toContain("food_recipe_links");
  });

  it("composes with the FTS query and other filters (all ANDed)", () => {
    const search = parseRecipeSearch({
      q: "soup",
      cuisine: "Thai",
      ingredient: "tofu",
    });
    const conditions = searchFilterConditions(search, {
      ingredientFoodId: "food_tofu",
    });
    // One condition each: free-text, cuisine, ingredient — combined with AND.
    expect(conditions).toHaveLength(3);
    const sql = renderAll(conditions);
    // FTS predicate is present…
    expect(sql).toContain("search_vector");
    // …alongside the cuisine filter…
    expect(sql).toContain("cuisine");
    // …and the ingredient/food constraint, joined by AND.
    expect(sql).toContain("food_recipe_links");
    expect(sql).toContain(" and ");
  });
});
