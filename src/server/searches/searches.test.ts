import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    transaction: vi.fn(),
    delete: vi.fn(),
    query: {
      savedSearches: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import {
  canonicalizeQuery,
  createSavedSearch,
  deleteSavedSearch,
} from "./mutations";
import { listMySavedSearches } from "./queries";
import { MAX_SAVED_SEARCHES } from "./validation";

const user = { id: "u1" } as unknown as Parameters<typeof createSavedSearch>[1];

/** Build a transaction stub whose callback receives the given `tx`. */
function withTx(tx: unknown) {
  dbMock.transaction.mockImplementation(
    async (cb: (t: unknown) => unknown) => cb(tx),
  );
}

describe("canonicalizeQuery (#278)", () => {
  it("normalizes params and drops the contextual default sort", () => {
    // `newest` is the default when there's no query, so it should be omitted.
    expect(canonicalizeQuery("tag=quick&tag=vegan&sort=newest")).toBe(
      "tag=quick&tag=vegan",
    );
  });

  it("keeps a free-text query and tolerates a leading '?'", () => {
    expect(canonicalizeQuery("?q=chicken")).toContain("q=chicken");
  });

  it("returns an empty string when no filters are active", () => {
    expect(canonicalizeQuery("sort=newest")).toBe("");
    expect(canonicalizeQuery("")).toBe("");
  });
});

describe("createSavedSearch (#278)", () => {
  beforeEach(() => {
    dbMock.transaction.mockReset();
  });

  it("rejects a search with no active filters", async () => {
    await expect(
      createSavedSearch({ name: "Empty", query: "sort=newest" }, user),
    ).rejects.toThrow("EMPTY_SEARCH");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("enforces the per-user cap for a new name", async () => {
    const select = vi.fn().mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ count: MAX_SAVED_SEARCHES }]) }),
    });
    const tx = {
      query: { savedSearches: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      select,
      insert: vi.fn(),
    };
    withTx(tx);

    await expect(
      createSavedSearch({ name: "Weeknight", query: "q=pasta" }, user),
    ).rejects.toThrow("LIMIT_REACHED");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("upserts and returns the row for a new search", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "s1" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const select = vi.fn().mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
    });
    const tx = {
      query: { savedSearches: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      select,
      insert,
    };
    withTx(tx);

    const result = await createSavedSearch(
      { name: "Quick veg", query: "tag=quick&sort=newest" },
      user,
    );

    expect(result).toEqual({ id: "s1" });
    // Stored query is canonicalized (default sort stripped).
    expect(values).toHaveBeenCalledWith({
      userId: "u1",
      name: "Quick veg",
      query: "tag=quick",
    });
  });

  it("skips the cap check when overwriting an existing name", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "s0" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const select = vi.fn();
    const tx = {
      query: {
        savedSearches: { findFirst: vi.fn().mockResolvedValue({ id: "s0" }) },
      },
      select,
      insert,
    };
    withTx(tx);

    const result = await createSavedSearch(
      { name: "Quick veg", query: "q=soup" },
      user,
    );

    expect(result).toEqual({ id: "s0" });
    expect(select).not.toHaveBeenCalled();
  });
});

describe("deleteSavedSearch (#278)", () => {
  beforeEach(() => {
    dbMock.delete.mockReset();
  });

  it("throws NOT_FOUND when nothing was deleted", async () => {
    dbMock.delete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([]) }),
    });
    await expect(deleteSavedSearch("missing", user)).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("returns the deleted row id on success", async () => {
    dbMock.delete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([{ id: "s1" }]) }),
    });
    await expect(deleteSavedSearch("s1", user)).resolves.toEqual({ id: "s1" });
  });
});

describe("listMySavedSearches (#278)", () => {
  beforeEach(() => {
    dbMock.query.savedSearches.findMany.mockReset();
  });

  it("returns [] for signed-out users without querying", async () => {
    await expect(listMySavedSearches(undefined)).resolves.toEqual([]);
    expect(dbMock.query.savedSearches.findMany).not.toHaveBeenCalled();
  });

  it("returns the user's saved searches", async () => {
    const rows = [
      { id: "s1", name: "Quick veg", query: "tag=quick", createdAt: new Date() },
    ];
    dbMock.query.savedSearches.findMany.mockResolvedValue(rows);
    await expect(listMySavedSearches("u1")).resolves.toEqual(rows);
  });
});
