import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A fake Drizzle surface: `select(...).from(...).where(...).limit(...)` powers
// the food-node lookup, and `query.recipes.findMany` captures the WHERE the
// query builds so we can assert the visibility + soft-delete predicates are
// applied. Nothing connects to a real database.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    query: {
      recipes: { findMany: vi.fn() },
      groupMembers: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({ db: dbMock, isDbConfigured: () => true }));

import type { User } from "~/server/db/schema";
import { getRecipesUsingFood } from "./queries";

const dialect = new PgDialect({ casing: "snake_case" });
const renderWhere = (where: SQL): string =>
  dialect.sqlToQuery(where).sql.toLowerCase();
const whereParams = (where: SQL): unknown[] => dialect.sqlToQuery(where).params;

/** Make `db.select(...).from(...).where(...).limit(...)` resolve to `rows`. */
function stubFoodLookup(rows: { id: string }[]): void {
  dbMock.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(rows) }),
    }),
  });
}

let capturedWhere: SQL | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  capturedWhere = undefined;
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
  dbMock.query.recipes.findMany.mockImplementation(
    async ({ where }: { where: SQL }) => {
      capturedWhere = where;
      return [];
    },
  );
});

describe("getRecipesUsingFood. Food resolution", () => {
  it("resolves a slug (or id) to the node before querying recipes", async () => {
    stubFoodLookup([{ id: "food_tomato" }]);
    await getRecipesUsingFood("tomato", null);
    expect(dbMock.query.recipes.findMany).toHaveBeenCalledTimes(1);
    // The resolved node id is bound into the ingredient/food predicate.
    expect(renderWhere(capturedWhere!)).toContain("food_id");
  });

  it("returns an empty page (no recipe query) for an unknown food", async () => {
    stubFoodLookup([]);
    const page = await getRecipesUsingFood("not-a-food", null);
    expect(page).toEqual({ items: [], nextOffset: null });
    expect(dbMock.query.recipes.findMany).not.toHaveBeenCalled();
  });
});

describe("getRecipesUsingFood. Visibility + soft-delete", () => {
  it("scopes an anonymous viewer to public, published, live recipes", async () => {
    stubFoodLookup([{ id: "food_tomato" }]);
    await getRecipesUsingFood("food_tomato", null);
    const sql = renderWhere(capturedWhere!);
    // Soft-delete predicate is always ANDed in (#165).
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("is null");
    // Anonymous sees only the public+published surface (enum values are bound
    // params, so assert the columns are gated and the values are supplied)…
    expect(sql).toContain("visibility");
    expect(sql).toContain("status");
    expect(whereParams(capturedWhere!)).toEqual(
      expect.arrayContaining(["public", "published"]),
    );
    // …never anyone's private/own recipes.
    expect(sql).not.toContain("author_id");
    // And it's constrained to the requested food.
    expect(sql).toContain("food_recipe_links");
  });

  it("widens a signed-in viewer to their own recipes too", async () => {
    stubFoodLookup([{ id: "food_tomato" }]);
    dbMock.query.groupMembers.findMany.mockResolvedValue([]);
    await getRecipesUsingFood("food_tomato", { id: "user_1" } as User);
    const sql = renderWhere(capturedWhere!);
    // Own-recipe branch is present alongside the public branch…
    expect(sql).toContain("author_id");
    // …but soft-delete still gates the whole set.
    expect(sql).toContain("deleted_at");
  });

  it("includes group recipes when the viewer belongs to groups", async () => {
    stubFoodLookup([{ id: "food_tomato" }]);
    dbMock.query.groupMembers.findMany.mockResolvedValue([
      { groupId: "grp_1" },
    ]);
    await getRecipesUsingFood("food_tomato", { id: "user_1" } as User);
    const sql = renderWhere(capturedWhere!);
    expect(sql).toContain("group_id");
  });
});

describe("getRecipesUsingFood. Pagination", () => {
  it("advances nextOffset when a full page comes back", async () => {
    stubFoodLookup([{ id: "food_tomato" }]);
    const rows = Array.from({ length: 2 }, (_, i) => ({
      id: `r_${i}`,
      author: {},
      tags: [],
      ratings: [],
    }));
    dbMock.query.recipes.findMany.mockImplementation(
      async ({ where }: { where: SQL }) => {
        capturedWhere = where;
        return rows;
      },
    );
    const page = await getRecipesUsingFood("food_tomato", null, {
      limit: 2,
      offset: 0,
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
    // Result shape mirrors searchRecipes (matchReason attached, no free text).
    expect(page.items[0]).toMatchObject({ id: "r_0", matchReason: null });
  });

  it("ends pagination on a short page", async () => {
    stubFoodLookup([{ id: "food_tomato" }]);
    dbMock.query.recipes.findMany.mockImplementation(
      async ({ where }: { where: SQL }) => {
        capturedWhere = where;
        return [{ id: "r_0", author: {}, tags: [], ratings: [] }];
      },
    );
    const page = await getRecipesUsingFood("food_tomato", null, { limit: 24 });
    expect(page.nextOffset).toBeNull();
  });
});
