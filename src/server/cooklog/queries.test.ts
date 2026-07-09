import { beforeEach, describe, expect, it, vi } from "vitest";

const { recipesFindFirst, groupMembersFindFirst, cookLogFindMany, userBlocksFindMany } =
  vi.hoisted(() => ({
    recipesFindFirst: vi.fn(),
    groupMembersFindFirst: vi.fn(),
    cookLogFindMany: vi.fn(),
    userBlocksFindMany: vi.fn(),
  }));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      recipes: { findFirst: recipesFindFirst },
      groupMembers: { findFirst: groupMembersFindFirst },
      cookLogEntries: { findMany: cookLogFindMany },
      userBlocks: { findMany: userBlocksFindMany },
    },
  },
  isDbConfigured: () => true,
}));

import { getFamilyCooks } from "./queries";

const cookRows = [
  {
    id: "ck1",
    cookedAt: new Date("2026-01-02"),
    note: null,
    photoUrl: null,
    user: { id: "blocked_1", name: "Bob", handle: "bob", avatarUrl: null },
  },
  {
    id: "ck2",
    cookedAt: new Date("2026-01-01"),
    note: null,
    photoUrl: null,
    user: { id: "friend_1", name: "Amy", handle: "amy", avatarUrl: null },
  },
];

describe("getFamilyCooks block filtering (#355)", () => {
  beforeEach(() => {
    recipesFindFirst.mockReset().mockResolvedValue({ groupId: "group_1" });
    groupMembersFindFirst.mockReset().mockResolvedValue({ id: "m1" });
    cookLogFindMany.mockReset().mockResolvedValue(cookRows);
    userBlocksFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns every shared cook when nothing is blocked", async () => {
    const cooks = await getFamilyCooks("recipe_1", "viewer_1");
    expect(cooks.map((c) => c.id)).toEqual(["ck1", "ck2"]);
  });

  it("drops a cook shared by a blocked member", async () => {
    // viewer_1 has blocked blocked_1.
    userBlocksFindMany.mockResolvedValue([
      { blockerId: "viewer_1", blockedId: "blocked_1" },
    ]);
    const cooks = await getFamilyCooks("recipe_1", "viewer_1");
    expect(cooks.map((c) => c.id)).toEqual(["ck2"]);
    expect(cooks.some((c) => c.cook?.id === "blocked_1")).toBe(false);
  });
});
