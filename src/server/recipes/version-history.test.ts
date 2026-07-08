import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Minimal Drizzle surface: getRecipeVersions only reads recipe_versions.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipeVersions: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { getRecipeVersions } from "./queries";
import { VERSION_HISTORY_PAGE_SIZE } from "./pagination";

/** Build `n` fake history rows numbered high→low (newest first). */
function versionRows(n: number, from = n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `v_${from - i}`,
    recipeId: "r1",
    versionNumber: from - i,
    label: `v${from - i}`,
    summary: null,
    createdAt: new Date(2024, 0, 1 + i),
    author: { id: "u1", name: "Cook", handle: "cook", avatarUrl: null },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRecipeVersions pagination (#159)", () => {
  it("returns a bounded first page plus a working cursor when over-fetched", async () => {
    // Over-fetch: the query asks for limit + 1 rows to sense a further page.
    dbMock.query.recipeVersions.findMany.mockResolvedValue(versionRows(3, 5));

    const page = await getRecipeVersions("r1", { limit: 2 });

    expect(page.items.map((v) => v.versionNumber)).toEqual([5, 4]);
    // Cursor is the last kept row, so the next page seeks versions < 4.
    expect(page.nextCursor).toBe(4);
  });

  it("returns a null cursor when the final page is short", async () => {
    dbMock.query.recipeVersions.findMany.mockResolvedValue(versionRows(2, 2));

    const page = await getRecipeVersions("r1", { limit: 2 });

    expect(page.items.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(page.nextCursor).toBeNull();
  });

  it("excludes the heavy snapshot blob and over-fetches by one row", async () => {
    dbMock.query.recipeVersions.findMany.mockResolvedValue(versionRows(1, 1));

    await getRecipeVersions("r1", { limit: 5 });

    const arg = dbMock.query.recipeVersions.findMany.mock.calls[0]![0];
    expect(arg.columns).toEqual({ snapshot: false });
    expect(arg.limit).toBe(6);
    expect(arg.where).toBeDefined();
  });

  it("defaults to the version-history page size and clamps hostile input", async () => {
    dbMock.query.recipeVersions.findMany.mockResolvedValue(versionRows(1, 1));
    await getRecipeVersions("r1");
    expect(dbMock.query.recipeVersions.findMany.mock.calls[0]![0].limit).toBe(
      VERSION_HISTORY_PAGE_SIZE + 1,
    );

    dbMock.query.recipeVersions.findMany.mockClear();
    await getRecipeVersions("r1", { limit: 0 });
    // 0 clamps up to a 1-row page, so the over-fetch asks for 2.
    expect(dbMock.query.recipeVersions.findMany.mock.calls[0]![0].limit).toBe(2);
  });

  it("passes a keyset predicate when a cursor is supplied", async () => {
    dbMock.query.recipeVersions.findMany.mockResolvedValue(versionRows(1, 3));

    await getRecipeVersions("r1", { beforeVersion: 4, limit: 2 });

    // The where clause ANDs the recipe filter with the versionNumber < cursor
    // keyset seek; we can only assert it is present without a live dialect.
    expect(dbMock.query.recipeVersions.findMany.mock.calls[0]![0].where).toBeDefined();
  });
});
