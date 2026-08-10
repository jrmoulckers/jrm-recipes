import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReactModule from "react";

vi.mock("server-only", () => ({}));

const { dbMock, resolveUserSlugMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findFirst: vi.fn() },
      recipeSlugAliases: { findFirst: vi.fn() },
    },
  },
  resolveUserSlugMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db: dbMock, isDbConfigured: () => true }));
vi.mock("~/server/users/slug", () => ({
  resolveUserSlug: resolveUserSlugMock,
}));
// `cache()` memoizes per-request; outside a request it would leak state across
// these cases, so it is reduced to a pass-through here.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof ReactModule>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

import { resolveFlatRecipe, resolveNamespacedRecipe } from "./resolve";

const owner = { userId: "usr_ada", redirect: false };

beforeEach(() => {
  vi.clearAllMocks();
  resolveUserSlugMock.mockResolvedValue(owner);
  dbMock.query.recipes.findFirst.mockResolvedValue(undefined);
  dbMock.query.recipeSlugAliases.findFirst.mockResolvedValue(undefined);
});

describe("resolveNamespacedRecipe", () => {
  it("resolves a live slug in the owner's namespace as canonical", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    await expect(resolveNamespacedRecipe("ada", "apple-pie")).resolves.toEqual({
      recipeId: "rec_1",
      canonical: true,
    });
    expect(dbMock.query.recipeSlugAliases.findFirst).not.toHaveBeenCalled();
  });

  it("marks a live slug reached through a retired user slug as non-canonical", async () => {
    resolveUserSlugMock.mockResolvedValue({ ...owner, redirect: true });
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    await expect(
      resolveNamespacedRecipe("ada-old", "apple-pie"),
    ).resolves.toEqual({ recipeId: "rec_1", canonical: false });
  });

  it("prefers a live slug over an alias holding the same segment", async () => {
    // A slug retired by one recipe and later re-issued to another must resolve
    // to the current holder, never silently redirect to the old content (#666).
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_live" });
    dbMock.query.recipeSlugAliases.findFirst.mockResolvedValue({
      recipeId: "rec_old",
    });

    await expect(resolveNamespacedRecipe("ada", "apple-pie")).resolves.toEqual({
      recipeId: "rec_live",
      canonical: true,
    });
  });

  it("falls back to a retired recipe slug as a redirect", async () => {
    dbMock.query.recipeSlugAliases.findFirst.mockResolvedValueOnce({
      recipeId: "rec_1",
    });

    await expect(resolveNamespacedRecipe("ada", "apple-tart")).resolves.toEqual(
      {
        recipeId: "rec_1",
        canonical: false,
      },
    );
  });

  it("resolves an id in the recipe position, but never as canonical", async () => {
    dbMock.query.recipes.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "rec_1" });

    await expect(resolveNamespacedRecipe("ada", "rec_1")).resolves.toEqual({
      recipeId: "rec_1",
      canonical: false,
    });
  });

  it("returns null for an unknown cook without querying recipes", async () => {
    resolveUserSlugMock.mockResolvedValue(null);

    await expect(
      resolveNamespacedRecipe("nobody", "apple-pie"),
    ).resolves.toBeNull();
    expect(dbMock.query.recipes.findFirst).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized segments before touching the database", async () => {
    await expect(resolveNamespacedRecipe("", "apple-pie")).resolves.toBeNull();
    await expect(
      resolveNamespacedRecipe("ada", "x".repeat(129)),
    ).resolves.toBeNull();
    expect(resolveUserSlugMock).not.toHaveBeenCalled();
  });
});

describe("resolveFlatRecipe", () => {
  it("resolves a bare id", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    await expect(resolveFlatRecipe("rec_1")).resolves.toEqual({
      recipeId: "rec_1",
      canonical: false,
    });
  });

  it("resolves a pre-namespacing slug through its seeded legacy alias", async () => {
    dbMock.query.recipeSlugAliases.findFirst.mockResolvedValueOnce({
      recipeId: "rec_1",
    });

    await expect(resolveFlatRecipe("apple-pie")).resolves.toEqual({
      recipeId: "rec_1",
      canonical: false,
    });
  });

  it("falls back to the oldest live holder of the slug", async () => {
    dbMock.query.recipes.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "rec_2" });

    await expect(resolveFlatRecipe("apple-pie")).resolves.toEqual({
      recipeId: "rec_2",
      canonical: false,
    });
  });

  it("never reports a flat URL as canonical", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    const resolved = await resolveFlatRecipe("rec_1");
    expect(resolved?.canonical).toBe(false);
  });

  it("returns null when nothing matches", async () => {
    await expect(resolveFlatRecipe("ghost")).resolves.toBeNull();
  });
});
