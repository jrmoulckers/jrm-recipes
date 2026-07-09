import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("~/server/db", () => ({
  db: { query: { reactions: { findMany: findManyMock } } },
  isDbConfigured: () => true,
}));
vi.mock("~/server/recipes/queries", () => ({ canViewRecipe: vi.fn() }));

import { getReactionsForTargets } from "./reactions";

type Row = {
  targetId: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string | null; handle: string | null };
};

const rows: Row[] = [
  {
    targetId: "c1",
    emoji: "love",
    userId: "blocked_1",
    user: { id: "blocked_1", name: "Blocked Bob", handle: "bob" },
  },
  {
    targetId: "c1",
    emoji: "love",
    userId: "friend_1",
    user: { id: "friend_1", name: "Amy", handle: "amy" },
  },
];

describe("getReactionsForTargets block filtering (#355)", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue(rows);
  });

  it("counts and names every reactor when nothing is blocked", async () => {
    const map = await getReactionsForTargets("comment", ["c1"], "viewer_1");
    const target = map.get("c1")!;
    expect(target.counts).toEqual([
      { emoji: "love", count: 2, reacted: false },
    ]);
    expect(target.reactors.love).toEqual(["Blocked Bob", "Amy"]);
  });

  it("drops a blocked reactor from both the count and the reactor names", async () => {
    const map = await getReactionsForTargets(
      "comment",
      ["c1"],
      "viewer_1",
      new Set(["blocked_1"]),
    );
    const target = map.get("c1")!;
    expect(target.counts).toEqual([
      { emoji: "love", count: 1, reacted: false },
    ]);
    expect(target.reactors.love).toEqual(["Amy"]);
    expect(target.reactors.love).not.toContain("Blocked Bob");
  });
});
