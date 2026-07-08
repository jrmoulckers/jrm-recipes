import { Column, SQL, is } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findMany: vi.fn(), findFirst: vi.fn() },
      groupMembers: { findMany: vi.fn() },
    },
    update: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { recipes, type User } from "~/server/db/schema";
import { deleteRecipe, restoreRecipe } from "./mutations";
import {
  getOwnedRecipe,
  getRecipe,
  listLibrary,
  listMyRecipes,
  listPublicRecipes,
  searchRecipes,
} from "./queries";

const author = { id: "user_1" } as User;

/** True when `where` filters (anywhere in the tree) on the given column. */
function filtersOnColumn(where: unknown, col: Column): boolean {
  if (is(where, SQL)) {
    return where.queryChunks.some((chunk) => filtersOnColumn(chunk, col));
  }
  if (is(where, Column)) return where === col;
  return false;
}

function lastWhere(fn: ReturnType<typeof vi.fn>): unknown {
  const call = fn.mock.calls.at(-1);
  return (call?.[0] as { where?: unknown } | undefined)?.where;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.recipes.findMany.mockResolvedValue([]);
  dbMock.query.recipes.findFirst.mockResolvedValue(undefined);
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
});

// Issue #165 — every recipe read path must exclude soft-deleted (tombstoned)
// rows. We assert each query builds a `where` that filters on recipes.deletedAt.
describe("recipe read paths exclude soft-deleted rows (issue #165)", () => {
  it("listMyRecipes filters on deleted_at", async () => {
    await listMyRecipes("user_1");
    expect(filtersOnColumn(lastWhere(dbMock.query.recipes.findMany), recipes.deletedAt)).toBe(true);
  });

  it("listPublicRecipes filters on deleted_at", async () => {
    await listPublicRecipes();
    expect(filtersOnColumn(lastWhere(dbMock.query.recipes.findMany), recipes.deletedAt)).toBe(true);
  });

  it("getRecipe filters on deleted_at", async () => {
    await getRecipe("apple-pie", null);
    expect(filtersOnColumn(lastWhere(dbMock.query.recipes.findFirst), recipes.deletedAt)).toBe(true);
  });

  it("getOwnedRecipe filters on deleted_at", async () => {
    await getOwnedRecipe("apple-pie", "user_1");
    expect(filtersOnColumn(lastWhere(dbMock.query.recipes.findFirst), recipes.deletedAt)).toBe(true);
  });

  it("listLibrary filters on deleted_at", async () => {
    await listLibrary(author);
    expect(filtersOnColumn(lastWhere(dbMock.query.recipes.findMany), recipes.deletedAt)).toBe(true);
  });

  it("searchRecipes filters on deleted_at", async () => {
    await searchRecipes(author, { cuisines: [], tags: [], sort: "newest" });
    expect(filtersOnColumn(lastWhere(dbMock.query.recipes.findMany), recipes.deletedAt)).toBe(true);
  });
});

describe("deleteRecipe / restoreRecipe (issue #165)", () => {
  /** Wire `db.update(...).set(...).where(...).returning(...)` to `rows`. */
  function stubUpdate(rows: unknown[]) {
    const set = vi.fn((_values: unknown) => ({
      where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve(rows)) })),
    }));
    dbMock.update.mockReturnValue({ set });
    return set;
  }

  it("soft-deletes by stamping deleted_at/deleted_by via UPDATE (not DELETE)", async () => {
    const set = stubUpdate([{ id: "r1" }]);

    const result = await deleteRecipe("r1", author);

    expect(dbMock.update).toHaveBeenCalledWith(recipes);
    const payload = set.mock.calls[0]![0] as {
      deletedAt: unknown;
      deletedBy: unknown;
    };
    expect(payload.deletedAt).toBeInstanceOf(Date);
    expect(payload.deletedBy).toBe("user_1");
    expect(result).toEqual({ id: "r1" });
  });

  it("deleteRecipe throws NOT_FOUND when no active row was tombstoned", async () => {
    stubUpdate([]);
    await expect(deleteRecipe("missing", author)).rejects.toThrow("NOT_FOUND");
  });

  it("restoreRecipe clears the tombstone", async () => {
    const set = stubUpdate([{ id: "r1", slug: "apple-pie" }]);

    const result = await restoreRecipe("r1", author);

    expect(set).toHaveBeenCalledWith({ deletedAt: null, deletedBy: null });
    expect(result).toEqual({ id: "r1", slug: "apple-pie" });
  });

  it("restoreRecipe throws NOT_FOUND when nothing was restored", async () => {
    stubUpdate([]);
    await expect(restoreRecipe("missing", author)).rejects.toThrow("NOT_FOUND");
  });
});
