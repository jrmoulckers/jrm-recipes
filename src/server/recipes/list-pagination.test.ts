import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Pagination unit tests for the recipe list queries (issues #57, #58). A fake
 * Drizzle surface lets us assert the SQL `limit`/`offset` we pass and the
 * `nextOffset` we derive without a real database.
 */
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findMany: vi.fn() },
      groupMembers: { findMany: vi.fn() },
      memberDietaryProfiles: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import type { User } from "~/server/db/schema";
import { listLibrary, listLibraryRecipeIds, searchRecipes } from "./queries";
import type { RecipeSearch } from "./search";
import { LIBRARY_PAGE_SIZE } from "./pagination";

const viewer = { id: "viewer_1" } as User;

function lastFindManyArg() {
  const call = dbMock.query.recipes.findMany.mock.calls.at(-1);
  return (call?.[0] ?? {}) as {
    limit?: number;
    offset?: number;
    columns?: Record<string, boolean>;
    with?: unknown;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
});

describe("listLibrary pagination (#57)", () => {
  it("passes limit/offset to the query and defaults to the library page size", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([]);
    await listLibrary(viewer);
    const arg = lastFindManyArg();
    expect(arg.limit).toBe(LIBRARY_PAGE_SIZE);
    expect(arg.offset).toBe(0);
  });

  it("advances nextOffset by the page size when a full page comes back", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const page = await listLibrary(viewer, { limit: 2, offset: 4 });
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.nextOffset).toBe(6);
  });

  it("returns a null nextOffset for a short final page", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: "a" }]);
    const page = await listLibrary(viewer, { limit: 2, offset: 0 });
    expect(page.nextOffset).toBeNull();
  });

  it("keeps the DB order (top-rated is sorted in SQL, not re-sorted in JS)", async () => {
    // Rows arrive already ordered by SQL; a JS re-sort would reorder these by
    // their aggregates. We assert the order is preserved.
    dbMock.query.recipes.findMany.mockResolvedValue([
      { id: "low", ratingCount: 1, ratingSum: 1 },
      { id: "high", ratingCount: 10, ratingSum: 50 },
    ]);
    const page = await listLibrary(viewer, { sort: "top-rated" });
    expect(page.items.map((r) => r.id)).toEqual(["low", "high"]);
  });

  it("returns an empty page without a viewer", async () => {
    const page = await listLibrary(null);
    expect(page).toEqual({ items: [], nextOffset: null });
    expect(dbMock.query.recipes.findMany).not.toHaveBeenCalled();
  });
});

describe("listLibraryRecipeIds (#57)", () => {
  it("selects only ids with no eager relations", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const ids = await listLibraryRecipeIds(viewer);
    expect(ids).toEqual(["a", "b"]);
    const arg = lastFindManyArg();
    expect(arg.columns).toEqual({ id: true });
    expect(arg.with).toBeUndefined();
    expect(arg.limit).toBeUndefined();
  });

  it("returns [] without a viewer", async () => {
    expect(await listLibraryRecipeIds(null)).toEqual([]);
    expect(dbMock.query.recipes.findMany).not.toHaveBeenCalled();
  });
});

describe("searchRecipes pagination (#58)", () => {
  const baseSearch: RecipeSearch = {
    cuisines: [],
    tags: [],
    sort: "newest",
  };

  it("passes limit/offset to the query", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([]);
    await searchRecipes(viewer, { ...baseSearch }, { limit: 24, offset: 48 });
    const arg = lastFindManyArg();
    expect(arg.limit).toBe(24);
    expect(arg.offset).toBe(48);
  });

  it("returns a Paginated result with nextOffset from the raw page", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([
      { id: "a", tags: [] },
      { id: "b", tags: [] },
    ]);
    const page = await searchRecipes(viewer, { ...baseSearch }, { limit: 2 });
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.nextOffset).toBe(2);
  });

  it("returns a null nextOffset for a short final page", async () => {
    dbMock.query.recipes.findMany.mockResolvedValue([{ id: "a", tags: [] }]);
    const page = await searchRecipes(viewer, { ...baseSearch }, { limit: 2 });
    expect(page.nextOffset).toBeNull();
  });
});
