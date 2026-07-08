import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests pin the *revalidation target* of the recipe mutation actions:
 * the slug-based detail route users actually view (see issue #175). The
 * mutations and auth are mocked so we exercise only the action's cache-busting.
 */

const {
  revalidatePathMock,
  requireUserMock,
  createRecipeMock,
  updateRecipeMock,
  forkRecipeMock,
  revertRecipeMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  createRecipeMock: vi.fn(),
  updateRecipeMock: vi.fn(),
  forkRecipeMock: vi.fn(),
  revertRecipeMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("~/server/auth", () => ({ requireUser: requireUserMock }));
vi.mock("~/server/db", () => ({ isDbConfigured: () => true }));
vi.mock("./import", () => ({ importRecipeFromUrl: vi.fn() }));
vi.mock("./mutations", () => ({
  createRecipe: createRecipeMock,
  updateRecipe: updateRecipeMock,
  forkRecipe: forkRecipeMock,
  revertRecipe: revertRecipeMock,
  deleteRecipe: vi.fn(),
}));

import {
  createRecipeAction,
  forkRecipeAction,
  revertRecipeAction,
  updateRecipeAction,
} from "./actions";
import { recipeInput } from "./validation";

const input = recipeInput.parse({ title: "Apple Pie" });

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1" });
});

describe("updateRecipeAction revalidation", () => {
  it("revalidates the slug-based detail path, not the id one", async () => {
    updateRecipeMock.mockResolvedValue({ id: "rec_1", slug: "apple-pie" });

    const res = await updateRecipeAction("rec_1", input);

    expect(res).toEqual({ ok: true, id: "rec_1", slug: "apple-pie" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/recipes/apple-pie");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/recipes/rec_1");
  });

  it("falls back to the id when the recipe has no slug", async () => {
    updateRecipeMock.mockResolvedValue({ id: "rec_1", slug: null });

    await updateRecipeAction("rec_1", input);

    expect(revalidatePathMock).toHaveBeenCalledWith("/recipes/rec_1");
  });
});

describe("revertRecipeAction revalidation", () => {
  it("revalidates the slug-based detail path of the reverted recipe", async () => {
    revertRecipeMock.mockResolvedValue({ id: "rec_1", slug: "apple-pie" });

    const res = await revertRecipeAction("rec_1", 2);

    expect(res).toEqual({ ok: true, id: "rec_1", slug: "apple-pie" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/recipes/apple-pie");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/recipes/rec_1");
  });
});

describe("forkRecipeAction revalidation", () => {
  it("revalidates the source recipe's slug-based path (its lineage changed)", async () => {
    forkRecipeMock.mockResolvedValue({
      id: "fork_1",
      slug: "apple-pie-adaptation",
      source: { id: "rec_1", slug: "apple-pie" },
    });

    // Adapt buttons pass the source *id*; the action must still bust the slug.
    const res = await forkRecipeAction("rec_1");

    expect(res).toEqual({
      ok: true,
      id: "fork_1",
      slug: "apple-pie-adaptation",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/recipes/apple-pie");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/recipes/rec_1");
  });
});

describe("createRecipeAction revalidation", () => {
  it("revalidates the new recipe's slug-based detail path", async () => {
    createRecipeMock.mockResolvedValue({ id: "rec_1", slug: "apple-pie" });

    const res = await createRecipeAction(input);

    expect(res).toEqual({ ok: true, id: "rec_1", slug: "apple-pie" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/recipes/apple-pie");
  });
});
