import { describe, expect, it } from "vitest";

import { buildWeeklyDigest, type DigestRecipe } from "./builder";

const NOW = new Date("2024-06-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const groups = [
  { id: "g_family", name: "Moulckers Family" },
  { id: "g_book", name: "Book Club" },
];

function recipe(
  overrides: Partial<DigestRecipe> & { id: string },
): DigestRecipe {
  return {
    slug: overrides.id,
    title: `Recipe ${overrides.id}`,
    groupId: "g_family",
    visibility: "group",
    authorName: "Aunt Mary",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  };
}

describe("buildWeeklyDigest", () => {
  it("summarizes new recipes in the recipient's groups", () => {
    const digest = buildWeeklyDigest({
      groups,
      recipes: [
        recipe({ id: "a", createdAt: daysAgo(2), updatedAt: daysAgo(2) }),
        recipe({ id: "b", createdAt: daysAgo(6), updatedAt: daysAgo(6) }),
      ],
      now: NOW,
    });

    expect(digest).not.toBeNull();
    expect(digest?.totalNew).toBe(2);
    expect(digest?.groups).toHaveLength(1);
    expect(digest?.groups[0]?.groupName).toBe("Moulckers Family");
    expect(digest?.groups[0]?.newRecipes.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("counts a recipe updated (but not created) in the window as updated", () => {
    const digest = buildWeeklyDigest({
      groups,
      recipes: [
        recipe({ id: "old", createdAt: daysAgo(40), updatedAt: daysAgo(2) }),
      ],
      now: NOW,
    });

    expect(digest?.totalNew).toBe(0);
    expect(digest?.totalUpdated).toBe(1);
    expect(digest?.groups[0]?.updatedCount).toBe(1);
  });

  it("excludes activity older than the window", () => {
    const digest = buildWeeklyDigest({
      groups,
      recipes: [
        recipe({ id: "stale", createdAt: daysAgo(40), updatedAt: daysAgo(40) }),
      ],
      now: NOW,
    });

    expect(digest).toBeNull();
  });

  it("returns null when there is no activity (no empty emails)", () => {
    expect(buildWeeklyDigest({ groups, recipes: [], now: NOW })).toBeNull();
  });

  it("never leaks recipes from a group the recipient isn't in", () => {
    const digest = buildWeeklyDigest({
      groups,
      recipes: [
        recipe({ id: "outside", groupId: "g_stranger" }),
        recipe({ id: "nogroup", groupId: null }),
      ],
      now: NOW,
    });

    expect(digest).toBeNull();
  });

  it("never surfaces private recipes even within the recipient's group", () => {
    const digest = buildWeeklyDigest({
      groups,
      recipes: [
        recipe({ id: "secret", visibility: "private" }),
        recipe({ id: "hidden", visibility: "unlisted" }),
      ],
      now: NOW,
    });

    expect(digest).toBeNull();
  });

  it("includes public recipes and groups by their owning group", () => {
    const digest = buildWeeklyDigest({
      groups,
      recipes: [
        recipe({ id: "fam", groupId: "g_family", visibility: "group" }),
        recipe({ id: "club", groupId: "g_book", visibility: "public" }),
      ],
      now: NOW,
    });

    expect(digest?.groups).toHaveLength(2);
    const ids = digest?.groups.map((g) => g.groupId).sort();
    expect(ids).toEqual(["g_book", "g_family"]);
  });

  it("honors a custom window length", () => {
    const recipes = [
      recipe({ id: "d3", createdAt: daysAgo(3), updatedAt: daysAgo(3) }),
    ];
    expect(
      buildWeeklyDigest({ groups, recipes, now: NOW, windowDays: 2 }),
    ).toBeNull();
    expect(
      buildWeeklyDigest({ groups, recipes, now: NOW, windowDays: 7 })?.totalNew,
    ).toBe(1);
  });
});
