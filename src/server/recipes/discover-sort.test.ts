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
 * top-rated ordering is computed (from the denormalized aggregate columns, not a
 * per-row scan of `ratings`) rather than needing a live Postgres.
 */
function render(fragment: SQL): { sql: string; params: unknown[] } {
  const { sql, params } = new PgDialect({ casing: "snake_case" }).sqlToQuery(
    fragment,
  );
  return { sql: sql.toLowerCase(), params };
}

describe("top-rated ordering reads the denormalized aggregates (issue #154)", () => {
  it("scores from recipes.rating_sum / rating_count, not a ratings subquery", () => {
    const { sql, params } = render(topRatedScoreSql());

    // The score is computed straight from the columns on `recipes`, so the feed
    // never scans the ratings table per row.
    expect(sql).toContain('"recipes"."rating_sum"');
    expect(sql).toContain('"recipes"."rating_count"');
    expect(sql).not.toContain('from "ratings"');
    expect(sql).not.toContain("sum(");
    expect(sql).not.toContain("count(");

    // Count-aware Bayesian prior: (sum + mean*count) / (count + priorCount).
    expect(params).toContain(TOP_RATED_PRIOR_MEAN * TOP_RATED_PRIOR_COUNT);
    expect(params).toContain(TOP_RATED_PRIOR_COUNT);
  });

  it("sorts rated recipes ahead of unrated ones", () => {
    const clauses = topRatedOrderBy().map((clause) => render(clause).sql);

    expect(clauses.length).toBeGreaterThanOrEqual(2);
    // The leading ORDER BY term flags recipes that have any (non-owner) rating,
    // read from the aggregate count so unrated recipes sort last.
    expect(clauses[0]).toContain('"recipes"."rating_count" > 0');
  });
});
