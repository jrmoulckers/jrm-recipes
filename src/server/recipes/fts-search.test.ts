import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";

import { recipeSearchMatchSql, recipeSearchRankSql } from "./queries";

/**
 * Issue #158 — recipe free-text search must run through a Postgres full-text
 * index (a generated, GIN-indexed `search_vector`) with relevance ranking,
 * rather than a `ILIKE '%q%'` sequential scan. No Postgres in unit tests, so we
 * assert the *shape* of the SQL the query layer emits: it matches against the
 * indexed vector and ranks by `ts_rank`, with the user query safely bound.
 */
function render(fragment: SQL): { sql: string; params: unknown[] } {
  const { sql, params } = new PgDialect({ casing: "snake_case" }).sqlToQuery(
    fragment,
  );
  return { sql: sql.toLowerCase(), params };
}

describe("recipe full-text search SQL (issue #158)", () => {
  it("matches the query against the GIN-indexed search_vector", () => {
    const { sql, params } = render(recipeSearchMatchSql("tomato soup"));

    // The predicate is `search_vector @@ websearch_to_tsquery(...)`, so Postgres
    // can satisfy it from the GIN index instead of scanning every recipe row.
    expect(sql).toContain('"recipes"."search_vector" @@');
    expect(sql).toContain("websearch_to_tsquery('english',");
    // No leading-wildcard scan of the base recipe text columns.
    expect(sql).not.toContain("ilike");
    // The raw user text is a bound parameter, never interpolated.
    expect(params).toEqual(["tomato soup"]);
  });

  it("uses websearch_to_tsquery so free-form input can't be a syntax error", () => {
    // A bare `to_tsquery` would throw on this input; websearch_ tolerates it.
    const { params } = render(recipeSearchMatchSql('"slow" cooked -beef'));
    expect(params).toEqual(['"slow" cooked -beef']);
  });

  it("ranks results by ts_rank over the same vector and query", () => {
    const { sql, params } = render(recipeSearchRankSql("tomato soup"));

    expect(sql).toContain('ts_rank("recipes"."search_vector",');
    expect(sql).toContain("websearch_to_tsquery('english',");
    expect(params).toEqual(["tomato soup"]);
  });
});
