import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, findManyMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    insert: insertMock,
    query: { userBlocks: { findMany: findManyMock } },
  },
  isDbConfigured: () => true,
}));

import { anyHidden, blockUser, filterBlocked, getHiddenAuthorIds } from "./blocks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("blockUser (#355)", () => {
  it("refuses to let a member block themselves", async () => {
    await expect(blockUser("user_1", "user_1")).rejects.toThrow("FORBIDDEN");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts a block with onConflictDoNothing so repeats are a no-op", async () => {
    const onConflictDoNothing = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    insertMock.mockReturnValue({ values });

    await blockUser("user_1", "user_2");

    expect(values).toHaveBeenCalledWith({
      blockerId: "user_1",
      blockedId: "user_2",
    });
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});

describe("getHiddenAuthorIds symmetric union (#355)", () => {
  it("hides people the viewer blocked AND people who blocked the viewer", async () => {
    findManyMock.mockResolvedValue([
      { blockerId: "me", blockedId: "a" }, // I blocked A
      { blockerId: "b", blockedId: "me" }, // B blocked me
    ]);

    const hidden = await getHiddenAuthorIds("me");

    expect(hidden.has("a")).toBe(true);
    expect(hidden.has("b")).toBe(true);
    expect(hidden.has("me")).toBe(false);
  });

  it("returns an empty set for signed-out viewers without touching the db", async () => {
    const hidden = await getHiddenAuthorIds(null);
    expect(hidden.size).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});

describe("filterBlocked / anyHidden pure helpers (#355)", () => {
  it("drops items whose author is hidden and keeps authorless items", () => {
    const items = [
      { id: "1", authorId: "a" },
      { id: "2", authorId: "b" },
      { id: "3", authorId: null },
    ];
    const result = filterBlocked(items, (i) => i.authorId, new Set(["b"]));
    expect(result.map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("returns the same list when nothing is hidden", () => {
    const items = [{ id: "1", authorId: "a" }];
    expect(filterBlocked(items, (i) => i.authorId, new Set())).toBe(items);
  });

  it("anyHidden reports whether any id is in the hidden set", () => {
    expect(anyHidden(["a", "b"], new Set(["b"]))).toBe(true);
    expect(anyHidden(["a", "c"], new Set(["b"]))).toBe(false);
  });
});
