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
  captureServerMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  createRecipeMock: vi.fn(),
  updateRecipeMock: vi.fn(),
  forkRecipeMock: vi.fn(),
  revertRecipeMock: vi.fn(),
  captureServerMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("~/server/auth", () => ({ requireUser: requireUserMock }));
vi.mock("~/server/db", () => ({ isDbConfigured: () => true }));
vi.mock("~/lib/analytics/server", () => ({ captureServer: captureServerMock }));
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

describe("recipe funnel analytics (#310)", () => {
  it("tracks recipe_created with a non-PII event shape on success", async () => {
    createRecipeMock.mockResolvedValue({ id: "rec_1", slug: "apple-pie" });

    await createRecipeAction(
      recipeInput.parse({
        title: "Apple Pie",
        coverImageUrl: "https://example.com/pie.jpg",
        visibility: "public",
        ingredients: [{ item: "apples" }, { item: "sugar" }],
        steps: [{ instruction: "bake" }],
      }),
    );

    expect(captureServerMock).toHaveBeenCalledWith("user_1", "recipe_created", {
      recipeId: "rec_1",
      ingredientCount: 2,
      stepCount: 1,
      hasPhoto: true,
      visibility: "public",
      source: "manual",
    });
  });

  it("does not track when validation fails (success paths only)", async () => {
    const res = await createRecipeAction({ title: "" } as never);

    expect(res.ok).toBe(false);
    expect(captureServerMock).not.toHaveBeenCalled();
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("tracks recipe_updated on success", async () => {
    updateRecipeMock.mockResolvedValue({ id: "rec_1", slug: "apple-pie" });

    await updateRecipeAction("rec_1", input);

    expect(captureServerMock).toHaveBeenCalledWith(
      "user_1",
      "recipe_updated",
      expect.objectContaining({ recipeId: "rec_1", visibility: "private" }),
    );
  });

  it("tracks recipe_forked with the source id on success", async () => {
    forkRecipeMock.mockResolvedValue({
      id: "fork_1",
      slug: "apple-pie-adaptation",
      source: { id: "rec_1", slug: "apple-pie" },
    });

    await forkRecipeAction("rec_1");

    expect(captureServerMock).toHaveBeenCalledWith("user_1", "recipe_forked", {
      recipeId: "fork_1",
      sourceId: "rec_1",
    });
  });

  it("tracks recipe_reverted on success", async () => {
    revertRecipeMock.mockResolvedValue({ id: "rec_1", slug: "apple-pie" });

    await revertRecipeAction("rec_1", 3);

    expect(captureServerMock).toHaveBeenCalledWith("user_1", "recipe_reverted", {
      recipeId: "rec_1",
      versionNumber: 3,
    });
  });
});
