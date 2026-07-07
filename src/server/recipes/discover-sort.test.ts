import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";

import {
  TOP_RATED_PRIOR_COUNT,
  TOP_RATED_PRIOR_MEAN,
} from "~/lib/ratings";
import { topRatedOrderBy, topRatedScoreSql } from "./queries";

/**
 * Render a Drizzle SQL fragment to text without a database connection, matching
 * the app's snake_case column casing. Lets us assert *where* and *how* the
 * top-rated ordering is computed (in SQL, over the full set) rather than needing
 * a live Postgres.
 */
function render(fragment: SQL): { sql: string; params: unknown[] } {
  const { sql, params } = new PgDialect({ casing: "snake_case" }).sqlToQuery(
    fragment,
  );
  return { sql: sql.toLowerCase(), params };
}

describe("top-rated ordering is computed globally in SQL", () => {
  it("ranks by a weighted score aggregated over every rating, not a page", () => {
    const { sql, params } = render(topRatedScoreSql());

    // A correlated aggregate over the whole ratings table means the ranking is
    // global (every rating counts) rather than a re-sort of one fetched window.
    expect(sql).toContain('from "ratings"');
    expect(sql).toContain("sum(");
    expect(sql).toContain("count(");
    expect(sql).toContain('"ratings"."recipe_id" = "recipes"."id"');

    // Count-aware Bayesian prior: (sum + mean*count) / (count + priorCount).
    expect(params).toContain(TOP_RATED_PRIOR_MEAN * TOP_RATED_PRIOR_COUNT);
    expect(params).toContain(TOP_RATED_PRIOR_COUNT);
  });

  it("excludes the recipe owner's own rating from the score", () => {
    const { sql } = render(topRatedScoreSql());

    expect(sql).toContain('"ratings"."user_id" <> "recipes"."author_id"');
  });

  it("sorts rated recipes ahead of unrated ones", () => {
    const clauses = topRatedOrderBy().map((clause) => render(clause).sql);

    expect(clauses.length).toBeGreaterThanOrEqual(2);
    // The leading ORDER BY term flags recipes that have any non-owner rating.
    expect(clauses[0]).toContain("count(*) > 0");
  });
});
