import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findFirst: vi.fn() },
      groupMembers: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import type { User } from "~/server/db/schema";
import { getRecipe, getRecipeByShareToken } from "./queries";

const author = { id: "author_1" } as User;
const stranger = { id: "stranger_1" } as User;

const unlisted = {
  id: "rec_1",
  slug: "grandmas-apple-pie",
  authorId: author.id,
  visibility: "unlisted",
  groupId: null,
  shareToken: "tok_secret_123456789012",
  shareLinkEnabled: true,
  ratings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
});

describe("unlisted share-token access (#204/#207)", () => {
  it("returns 404 (null) when an anonymous viewer guesses the slug", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(unlisted);
    // No token: slug guess must not resolve an unlisted recipe.
    await expect(getRecipe("grandmas-apple-pie", null)).resolves.toBeNull();
  });

  it("returns 404 for a signed-in non-owner guessing the slug", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(unlisted);
    await expect(getRecipe("grandmas-apple-pie", stranger)).resolves.toBeNull();
  });

  it("still lets the owner reach their unlisted recipe by slug", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(unlisted);
    await expect(getRecipe("grandmas-apple-pie", author)).resolves.toBe(
      unlisted,
    );
  });

  it("grants access when the valid share token is presented", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(unlisted);
    await expect(
      getRecipe("grandmas-apple-pie", null, "tok_secret_123456789012"),
    ).resolves.toBe(unlisted);
  });

  it("rejects a wrong token", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(unlisted);
    await expect(
      getRecipe("grandmas-apple-pie", null, "wrong-token"),
    ).resolves.toBeNull();
  });

  it("rejects the token when the share link is disabled (#207)", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue({
      ...unlisted,
      shareLinkEnabled: false,
    });
    await expect(
      getRecipe("grandmas-apple-pie", null, "tok_secret_123456789012"),
    ).resolves.toBeNull();
  });

  it("getRecipeByShareToken resolves a live token", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValue(unlisted);
    await expect(
      getRecipeByShareToken("tok_secret_123456789012"),
    ).resolves.toBe(unlisted);
  });

  it("getRecipeByShareToken returns null for an empty token", async () => {
    await expect(getRecipeByShareToken("")).resolves.toBeNull();
    expect(dbMock.query.recipes.findFirst).not.toHaveBeenCalled();
  });
});
