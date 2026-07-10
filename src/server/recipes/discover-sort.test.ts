import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";

import { TOP_RATED_PRIOR_COUNT, TOP_RATED_PRIOR_MEAN } from "~/lib/ratings";
import { topRatedOrderBy, topRatedScoreSql } from "./queries";
import { relevanceOrderBy, relevanceScoreSql } from "./queries";
import { popularOrderBy, popularityScoreSql } from "./queries";

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

describe("best-match relevance is a weighted field score in SQL (#260)", () => {
  it("weights a title hit above tag, cuisine, ingredient, description", () => {
    const { sql } = render(relevanceScoreSql("%chicken%"));

    // Field weights encode intent: title 5 > tag 4 > cuisine 3 > ingredient 2 >
    // description 1, so a titled "Chicken ..." outranks a recipe that merely
    // lists chicken stock as an ingredient.
    expect(sql).toMatch(/"recipes"\."title" ilike \$\d+ then 5/);
    expect(sql).toMatch(/"recipes"\."cuisine" ilike \$\d+ then 3/);
    expect(sql).toMatch(/"recipes"\."description" ilike \$\d+ then 1/);
    // Tag (4) and ingredient (2) matches are correlated existence subqueries.
    expect(sql).toContain('from "recipe_tags"');
    expect(sql).toMatch(/then 4/);
    expect(sql).toContain('from "recipe_ingredients"');
    expect(sql).toMatch(/then 2/);
  });

  it("orders by the weighted score first, then rating, then recency", () => {
    const clauses = relevanceOrderBy("%chicken%").map((c) => render(c).sql);

    expect(clauses.length).toBeGreaterThanOrEqual(3);
    // Leading term is the weighted relevance score (carries the title weight).
    expect(clauses[0]).toContain("then 5");
    // A later term breaks ties with the weighted rating score, now read from the
    // denormalized aggregate columns on `recipes` (issue #154) rather than a
    // per-row scan of the ratings table.
    expect(clauses.some((c) => c.includes('"recipes"."rating_sum"'))).toBe(
      true,
    );
  });
});

describe("popular ordering ranks by cooks + saves in SQL (#276)", () => {
  it("sums cook-log and favorite counts", () => {
    const { sql } = render(popularityScoreSql());

    // Popularity is a correlated count over both signals, so the ranking is
    // global (every cook and save counts) rather than a per-page re-sort.
    expect(sql).toContain('from "cook_log_entries"');
    expect(sql).toContain('from "favorites"');
    expect(sql).toContain("count(*)");
    expect(sql).toContain('"cook_log_entries"."recipe_id" = "recipes"."id"');
    expect(sql).toContain('"favorites"."recipe_id" = "recipes"."id"');
  });

  it("puts recipes with activity first and ranks more-cooked higher", () => {
    const clauses = popularOrderBy().map((c) => render(c).sql);

    expect(clauses.length).toBeGreaterThanOrEqual(3);
    // Leading term flags recipes with any cook/save so inert recipes sort last.
    expect(clauses[0]).toContain("exists");
    // The score term is descending, so a more-cooked/-saved recipe outranks a
    // quieter one; the count sum lives in the second clause.
    expect(clauses[1]).toContain("count(*)");
  });
});
