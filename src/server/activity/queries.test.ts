import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMocks, getHiddenAuthorIdsMock } = vi.hoisted(() => ({
  findManyMocks: {
    recipes: vi.fn(),
    cookLogEntries: vi.fn(),
    reviews: vi.fn(),
    comments: vi.fn(),
    groupMembers: vi.fn(),
  },
  getHiddenAuthorIdsMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      recipes: { findMany: findManyMocks.recipes },
      cookLogEntries: { findMany: findManyMocks.cookLogEntries },
      reviews: { findMany: findManyMocks.reviews },
      comments: { findMany: findManyMocks.comments },
      groupMembers: { findMany: findManyMocks.groupMembers },
    },
  },
  isDbConfigured: () => true,
}));
vi.mock("~/server/moderation/blocks", () => ({
  getHiddenAuthorIds: getHiddenAuthorIdsMock,
}));

import { getGroupActivity } from "./queries";

const actor = { id: "u1", name: "Grandma", handle: null, avatarUrl: null };

function at(iso: string) {
  return new Date(iso);
}

beforeEach(() => {
  vi.clearAllMocks();
  getHiddenAuthorIdsMock.mockResolvedValue(new Set<string>());
  findManyMocks.recipes.mockResolvedValue([]);
  findManyMocks.cookLogEntries.mockResolvedValue([]);
  findManyMocks.reviews.mockResolvedValue([]);
  findManyMocks.comments.mockResolvedValue([]);
  findManyMocks.groupMembers.mockResolvedValue([]);
});

describe("getGroupActivity membership gate (#349)", () => {
  it("returns an empty page for a non-member (no role) without querying", async () => {
    const page = await getGroupActivity("group_1", { id: "u1", role: null });
    expect(page).toEqual({ events: [], nextCursor: null });
    expect(findManyMocks.recipes).not.toHaveBeenCalled();
  });
});

describe("getGroupActivity aggregation (#349)", () => {
  it("unions sources newest-first with the right kinds", async () => {
    findManyMocks.recipes.mockResolvedValue([
      {
        id: "r1",
        slug: "ragu",
        title: "Sunday Ragù",
        coverImageUrl: null,
        createdAt: at("2026-01-01T10:00:00Z"),
        author: actor,
      },
    ]);
    findManyMocks.cookLogEntries.mockResolvedValue([
      {
        id: "c1",
        note: "So good",
        photoUrl: null,
        recipeId: "r1",
        userId: "u1",
        createdAt: at("2026-01-03T10:00:00Z"),
        user: actor,
      },
    ]);
    findManyMocks.reviews.mockResolvedValue([
      {
        id: "rev1",
        title: "Perfect",
        body: null,
        rating: 5,
        recipeId: "r1",
        userId: "u2",
        createdAt: at("2026-01-02T10:00:00Z"),
        user: { id: "u2", name: "Dad", handle: null, avatarUrl: null },
      },
    ]);

    const page = await getGroupActivity("group_1", { id: "u1", role: "member" });

    expect(page.events.map((e) => e.kind)).toEqual([
      "cook_shared", // Jan 3
      "review", // Jan 2
      "recipe_added", // Jan 1
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("paginates: caps at the limit and returns a cursor when more remain", async () => {
    findManyMocks.recipes.mockResolvedValue([
      {
        id: "r1",
        slug: "a",
        title: "A",
        coverImageUrl: null,
        createdAt: at("2026-01-01T00:00:00Z"),
        author: actor,
      },
    ]);
    findManyMocks.reviews.mockResolvedValue([
      {
        id: "rev1",
        title: "b",
        body: null,
        rating: 4,
        recipeId: "r1",
        userId: "u1",
        createdAt: at("2026-01-02T00:00:00Z"),
        user: actor,
      },
    ]);
    findManyMocks.comments.mockResolvedValue([
      {
        id: "cm1",
        kind: "comment",
        body: "c",
        recipeId: "r1",
        userId: "u1",
        createdAt: at("2026-01-03T00:00:00Z"),
        user: actor,
      },
    ]);

    const page = await getGroupActivity(
      "group_1",
      { id: "u1", role: "member" },
      { limit: 2 },
    );

    expect(page.events).toHaveLength(2);
    expect(page.events[0]!.kind).toBe("comment"); // Jan 3 newest
    expect(page.nextCursor).toBe(at("2026-01-02T00:00:00Z").toISOString());
  });

  it("filters out events authored by blocked users", async () => {
    getHiddenAuthorIdsMock.mockResolvedValue(new Set(["blocked"]));
    findManyMocks.cookLogEntries.mockResolvedValue([
      {
        id: "c1",
        note: "hidden",
        photoUrl: null,
        recipeId: "r1",
        userId: "blocked",
        createdAt: at("2026-01-03T10:00:00Z"),
        user: { id: "blocked", name: "Nope", handle: null, avatarUrl: null },
      },
    ]);

    const page = await getGroupActivity("group_1", { id: "u1", role: "member" });
    expect(page.events).toHaveLength(0);
  });
});
