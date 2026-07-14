import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// searchFilterConditions only touches `db` for free-text/tag EXISTS subqueries;
// every case here avoids those, so a bare stub keeps the import side-effect-free.
vi.mock("~/server/db", () => ({ db: {}, isDbConfigured: () => true }));

import { parseRecipeSearch } from "./search";
import { searchFilterConditions } from "./queries";

const dialect = new PgDialect({ casing: "snake_case" });
const render = (...args: Parameters<typeof searchFilterConditions>): string => {
  const conditions = searchFilterConditions(...args);
  const combined = and(...conditions);
  return combined ? dialect.sqlToQuery(combined).sql.toLowerCase() : "";
};

describe("searchFilterConditions (scoped facet counts, #274)", () => {
  it("includes every active filter by default", () => {
    const sql = render(
      parseRecipeSearch({
        cuisine: "Italian",
        difficulty: "easy",
        maxTime: "30",
      }),
    );
    expect(sql).toContain("cuisine");
    expect(sql).toContain("difficulty");
    expect(sql).toContain("total_minutes");
  });

  it("omits the cuisine predicate when counting cuisines (skip: cuisine)", () => {
    const search = parseRecipeSearch({
      cuisine: "Italian",
      difficulty: "easy",
      maxTime: "30",
    });
    const sql = render(search, { skip: "cuisine" });
    // The cuisine facet drops out so its own values don't constrain the count,
    // but the other active filters still scope it.
    expect(sql).not.toContain("cuisine");
    expect(sql).toContain("difficulty");
    expect(sql).toContain("total_minutes");
  });

  it("drops the tag EXISTS clauses when counting tags (skip: tag)", () => {
    const search = parseRecipeSearch({
      tag: ["vegan", "weeknight"],
      difficulty: "easy",
    });
    // Only the difficulty filter should remain — no correlated tag subquery.
    const conditions = searchFilterConditions(search, { skip: "tag" });
    expect(conditions).toHaveLength(1);
    expect(render(search, { skip: "tag" })).not.toContain("exists");
  });

  it("ORs multiple selected cuisines together", () => {
    const sql = render(parseRecipeSearch({ cuisine: ["Italian", "Thai"] }));
    expect(sql).toContain(" or ");
    expect((sql.match(/cuisine/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("searchFilterConditions — dietary filter (#273)", () => {
  it("matches a selected diet against BOTH derived and declared columns", () => {
    const sql = render(parseRecipeSearch({ diet: "vegan" }));
    expect(sql).toContain("dietary_tags");
    expect(sql).toContain("dietary_flags");
    // The single diet is satisfied by either column → an OR over the two.
    expect(sql).toContain(" or ");
  });

  it("AND-combines multiple selected diets (one predicate each)", () => {
    const search = parseRecipeSearch({ diet: ["vegan", "gluten-free"] });
    // One condition per diet, each an (dietary_tags OR dietary_flags) clause.
    expect(searchFilterConditions(search)).toHaveLength(2);
    const sql = render(search);
    expect((sql.match(/dietary_tags/g) ?? []).length).toBe(2);
    expect((sql.match(/dietary_flags/g) ?? []).length).toBe(2);
  });

  it("adds no dietary predicate when none is selected", () => {
    const sql = render(parseRecipeSearch({ cuisine: "Italian" }));
    expect(sql).not.toContain("dietary_tags");
  });
});

describe("searchFilterConditions — viewer-scoped params stay out (#91)", () => {
  it("emits no predicate for group or mine (they filter in searchRecipes)", () => {
    // `group`/`mine` need the viewer + their group ids, so they're applied in
    // `searchRecipes` (like `safeFor`), never in this pure, viewer-less builder.
    const search = parseRecipeSearch({ group: "grp123", mine: "1" });
    expect(searchFilterConditions(search)).toHaveLength(0);
    const sql = render(search);
    expect(sql).not.toContain("group_id");
    expect(sql).not.toContain("author_id");
  });
});
