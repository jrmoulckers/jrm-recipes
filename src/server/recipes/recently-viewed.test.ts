import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    insert: vi.fn(),
    select: vi.fn(),
    query: {
      groupMembers: { findMany: vi.fn() },
      recipes: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { listRecentlyViewed, recordRecipeView } from "./queries";

const viewer = { id: "u1" } as unknown as Parameters<typeof listRecentlyViewed>[0];

describe("recordRecipeView (#280)", () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
  });

  it("upserts viewedAt on the (user, recipe) unique key", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValue({ values });

    await recordRecipeView("u1", "r1");

    expect(values).toHaveBeenCalledWith({ userId: "u1", recipeId: "r1" });
    const arg = onConflictDoUpdate.mock.calls[0]![0] as {
      set: { viewedAt: unknown };
    };
    expect(arg.set.viewedAt).toBeInstanceOf(Date);
  });
});

describe("listRecentlyViewed (#280)", () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.query.groupMembers.findMany.mockReset();
    dbMock.query.recipes.findMany.mockReset();
  });

  it("returns [] for signed-out viewers without hitting the database", async () => {
    await expect(listRecentlyViewed(null)).resolves.toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.query.groupMembers.findMany).not.toHaveBeenCalled();
  });

  it("orders visible recipes by recency and applies the limit", async () => {
    dbMock.query.groupMembers.findMany.mockResolvedValue([]);

    // Most-recent-first view order returned by the views query.
    const limit = vi
      .fn()
      .mockResolvedValue([
        { recipeId: "r3" },
        { recipeId: "r1" },
        { recipeId: "r2" },
      ]);
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit,
    };
    dbMock.select.mockReturnValue(chain);

    // Recipe rows come back in arbitrary order; the function re-sorts them.
    dbMock.query.recipes.findMany.mockResolvedValue([
      { id: "r1", title: "One" },
      { id: "r2", title: "Two" },
      { id: "r3", title: "Three" },
    ]);

    const result = await listRecentlyViewed(viewer, 2);
    expect(result.map((r) => r.id)).toEqual(["r3", "r1"]);
  });

  it("returns [] when the viewer has no view history", async () => {
    dbMock.query.groupMembers.findMany.mockResolvedValue([]);
    const limit = vi.fn().mockResolvedValue([]);
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit,
    };
    dbMock.select.mockReturnValue(chain);

    await expect(listRecentlyViewed(viewer)).resolves.toEqual([]);
    expect(dbMock.query.recipes.findMany).not.toHaveBeenCalled();
  });
});
