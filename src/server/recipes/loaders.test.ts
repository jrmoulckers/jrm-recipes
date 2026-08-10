import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReactModule from "react";

vi.mock("server-only", () => ({}));

const {
  getCurrentUserMock,
  getRecipeMock,
  resolveNamespacedRecipeMock,
  resolveFlatRecipeMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getRecipeMock: vi.fn(),
  resolveNamespacedRecipeMock: vi.fn(),
  resolveFlatRecipeMock: vi.fn(),
}));

vi.mock("~/server/auth", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("~/server/recipes/queries", () => ({ getRecipe: getRecipeMock }));
vi.mock("~/server/recipes/resolve", () => ({
  resolveNamespacedRecipe: resolveNamespacedRecipeMock,
  resolveFlatRecipe: resolveFlatRecipeMock,
}));
// `cache()` memoizes per-request; outside a request it would leak resolutions
// across these cases, so it is reduced to a pass-through here.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof ReactModule>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

import { getNamespacedRecipeForViewer } from "./loaders";

const viewer = { id: "usr_ada" };
const recipe = { id: "rec_1", slug: "apple-pie" };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(viewer);
  getRecipeMock.mockResolvedValue(recipe);
  resolveNamespacedRecipeMock.mockResolvedValue(null);
  resolveFlatRecipeMock.mockResolvedValue(null);
});

describe("getNamespacedRecipeForViewer", () => {
  it("returns a canonical hit without consulting the legacy fallback", async () => {
    resolveNamespacedRecipeMock.mockResolvedValue({
      recipeId: "rec_1",
      canonical: true,
    });

    await expect(
      getNamespacedRecipeForViewer("ada", "apple-pie"),
    ).resolves.toEqual({
      user: viewer,
      recipe,
      canonical: true,
      legacySubRoute: null,
    });
    expect(resolveFlatRecipeMock).not.toHaveBeenCalled();
  });

  it.each(["cook", "print", "keepsake", "edit"])(
    "recovers the pre-cutover /recipes/<slug>/%s link",
    async (subRoute) => {
      resolveFlatRecipeMock.mockResolvedValue({
        recipeId: "rec_1",
        canonical: false,
      });

      await expect(
        getNamespacedRecipeForViewer("apple-pie", subRoute),
      ).resolves.toEqual({
        user: viewer,
        recipe,
        canonical: false,
        legacySubRoute: subRoute,
      });
      expect(resolveFlatRecipeMock).toHaveBeenCalledWith("apple-pie");
    },
  );

  it("lets a real recipe slugged like a sub-route win over the fallback", async () => {
    resolveNamespacedRecipeMock.mockResolvedValue({
      recipeId: "rec_cook",
      canonical: true,
    });

    const result = await getNamespacedRecipeForViewer("ada", "cook");

    expect(result.legacySubRoute).toBeNull();
    expect(result.canonical).toBe(true);
    expect(resolveFlatRecipeMock).not.toHaveBeenCalled();
  });

  it("does not treat an arbitrary second segment as a legacy sub-route", async () => {
    await expect(
      getNamespacedRecipeForViewer("apple-pie", "nope"),
    ).resolves.toEqual({
      user: viewer,
      recipe: null,
      canonical: true,
      legacySubRoute: null,
    });
    expect(resolveFlatRecipeMock).not.toHaveBeenCalled();
  });

  it("404s a legacy sub-route whose recipe segment resolves to nothing", async () => {
    const result = await getNamespacedRecipeForViewer("ghost", "cook");

    expect(result.recipe).toBeNull();
    expect(result.legacySubRoute).toBeNull();
  });
});
