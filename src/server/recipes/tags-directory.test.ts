import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock, state } = vi.hoisted(() => ({
  dbMock: { select: vi.fn() },
  state: { configured: true, rows: [] as unknown[] },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => state.configured,
}));

import { listTagsWithCounts } from "./queries";

describe("listTagsWithCounts (tag directory, #279)", () => {
  beforeEach(() => {
    state.configured = true;
    state.rows = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "from", "innerJoin", "where", "groupBy"]) {
      chain[method] = vi.fn(() => chain);
    }
    // The awaited terminal call resolves to the rows.
    chain.orderBy = vi.fn(() => Promise.resolve(state.rows));
    dbMock.select.mockReturnValue(chain);
  });

  it("returns [] without touching the database when unconfigured", async () => {
    state.configured = false;
    await expect(listTagsWithCounts(null)).resolves.toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("maps visible tag rows to slug/name/count", async () => {
    state.rows = [
      { slug: "quick", name: "Quick", count: 5 },
      { slug: "vegan", name: "Vegan", count: 2 },
    ];
    await expect(listTagsWithCounts(null)).resolves.toEqual([
      { slug: "quick", name: "Quick", count: 5 },
      { slug: "vegan", name: "Vegan", count: 2 },
    ]);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("returns [] when no tags have visible recipes", async () => {
    state.rows = [];
    await expect(listTagsWithCounts(null)).resolves.toEqual([]);
  });
});
