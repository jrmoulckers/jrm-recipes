import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  followsFindManyMock,
  usersFindManyMock,
  recipesFindManyMock,
  reviewsFindManyMock,
  cooksFindManyMock,
  getHiddenAuthorIdsMock,
} = vi.hoisted(() => ({
  followsFindManyMock: vi.fn(),
  usersFindManyMock: vi.fn(),
  recipesFindManyMock: vi.fn(),
  reviewsFindManyMock: vi.fn(),
  cooksFindManyMock: vi.fn(),
  getHiddenAuthorIdsMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      follows: { findMany: followsFindManyMock },
      users: { findMany: usersFindManyMock },
      recipes: { findMany: recipesFindManyMock },
      reviews: { findMany: reviewsFindManyMock },
      cookLogEntries: { findMany: cooksFindManyMock },
    },
  },
  isDbConfigured: () => true,
}));

vi.mock("~/server/moderation/blocks", () => ({
  getHiddenAuthorIds: getHiddenAuthorIdsMock,
}));

import { getFollowingActivity } from "./queries";

const author = { id: "followee", name: "Fran", handle: "fran", avatarUrl: null };
const publicRecipe = {
  id: "r_pub",
  slug: "public-stew",
  title: "Public Stew",
  coverImageUrl: null,
  visibility: "public",
  status: "published",
  deletedAt: null,
};
const groupRecipe = {
  id: "r_grp",
  slug: "family-secret",
  title: "Family Secret Sauce",
  coverImageUrl: null,
  visibility: "group",
  status: "published",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  followsFindManyMock.mockResolvedValue([{ followeeId: "followee" }]);
  usersFindManyMock.mockResolvedValue([{ id: "followee" }]);
  getHiddenAuthorIdsMock.mockResolvedValue(new Set());
  recipesFindManyMock.mockResolvedValue([]);
  reviewsFindManyMock.mockResolvedValue([]);
  cooksFindManyMock.mockResolvedValue([]);
});

describe("getFollowingActivity opt-in / block gating", () => {
  it("returns empty (without reading activity) when the viewer follows no one", async () => {
    followsFindManyMock.mockResolvedValue([]);
    const page = await getFollowingActivity("me");
    expect(page.events).toEqual([]);
    expect(recipesFindManyMock).not.toHaveBeenCalled();
    expect(reviewsFindManyMock).not.toHaveBeenCalled();
    expect(cooksFindManyMock).not.toHaveBeenCalled();
  });

  it("contributes nothing once a followee opts out (re-checked at read time)", async () => {
    usersFindManyMock.mockResolvedValue([]); // followee no longer opted in
    const page = await getFollowingActivity("me");
    expect(page.events).toEqual([]);
    expect(recipesFindManyMock).not.toHaveBeenCalled();
  });

  it("drops a followee involved in a block, in either direction", async () => {
    getHiddenAuthorIdsMock.mockResolvedValue(new Set(["followee"]));
    const page = await getFollowingActivity("me");
    expect(page.events).toEqual([]);
    expect(recipesFindManyMock).not.toHaveBeenCalled();
  });
});

describe("getFollowingActivity public-only firewall", () => {
  it("surfaces a followee's public published recipe", async () => {
    recipesFindManyMock.mockResolvedValue([
      {
        id: "r_pub",
        slug: "public-stew",
        title: "Public Stew",
        coverImageUrl: null,
        createdAt: new Date("2024-01-01"),
        author,
      },
    ]);

    const page = await getFollowingActivity("me");
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({
      kind: "recipe_added",
      recipe: { title: "Public Stew" },
    });
  });

  it("NEVER leaks group-private activity via the follow path", async () => {
    // A review AND a cook that reference a group-visibility recipe. Even though
    // the (mocked) DB handed them back, the JS visibility firewall must drop them.
    reviewsFindManyMock.mockResolvedValue([
      {
        id: "rev_grp",
        title: "Family only",
        body: "secret",
        rating: 5,
        createdAt: new Date("2024-01-02"),
        user: author,
        recipe: groupRecipe,
      },
      {
        id: "rev_pub",
        title: "Loved it",
        body: "public review",
        rating: 4,
        createdAt: new Date("2024-01-03"),
        user: author,
        recipe: publicRecipe,
      },
    ]);
    cooksFindManyMock.mockResolvedValue([
      {
        id: "cook_grp",
        note: "made the family secret",
        photoUrl: null,
        createdAt: new Date("2024-01-04"),
        user: author,
        recipe: groupRecipe,
      },
    ]);

    const page = await getFollowingActivity("me");

    const titles = page.events.map((e) => e.recipe?.title);
    expect(titles).toContain("Public Stew");
    expect(titles).not.toContain("Family Secret Sauce");
    // Only the single public review survives.
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({ kind: "review" });
  });

  it("keeps a non-group-shared cook on a public recipe", async () => {
    cooksFindManyMock.mockResolvedValue([
      {
        id: "cook_pub",
        note: "yum",
        photoUrl: "https://img/x.jpg",
        createdAt: new Date("2024-01-05"),
        user: author,
        recipe: publicRecipe,
      },
    ]);

    const page = await getFollowingActivity("me");
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({
      kind: "cook_shared",
      recipe: { title: "Public Stew" },
    });
  });
});
