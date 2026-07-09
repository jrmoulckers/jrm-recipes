import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RatingSort } from "~/lib/ratings";

/**
 * Unit tests for `loadMorePublicRecipesAction` (issue #228): the "Load more"
 * pagination on `/recipes`. It clamps a possibly-malformed offset, sanitizes the
 * sort, re-derives the viewer server-side, and hides recipes already in the
 * viewer's library. Auth + queries are mocked; the real `parseRatingSort` runs.
 */

vi.mock("~/server/auth", async () =>
  (await import("~/test/harness")).authModuleMock(),
);

const { listPublicRecipesMock, listLibraryMock } = vi.hoisted(() => ({
  listPublicRecipesMock: vi.fn(),
  listLibraryMock: vi.fn(),
}));

vi.mock("./queries", () => ({
  listPublicRecipes: listPublicRecipesMock,
  listLibrary: listLibraryMock,
}));

import { loadMorePublicRecipesAction } from "./discover-actions";
import { useAuthMock } from "~/test/harness";
import { makeUser } from "~/test/factories";

function page(ids: string[], nextOffset: number | null = 24) {
  return { items: ids.map((id) => ({ id })), nextOffset };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock(makeUser({ id: "viewer_1" }));
  listPublicRecipesMock.mockResolvedValue(page(["r1"]));
  listLibraryMock.mockResolvedValue([]);
});

describe("offset clamping", () => {
  it.each([
    ["negative", -5],
    ["non-integer", 2.5],
    ["zero", 0],
  ])("clamps a %s offset to 0", async (_label, offset) => {
    await loadMorePublicRecipesAction(offset);
    expect(listPublicRecipesMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("passes a valid positive offset through unchanged", async () => {
    await loadMorePublicRecipesAction(40);
    expect(listPublicRecipesMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 40 }),
    );
  });
});

describe("sort sanitization", () => {
  it("normalizes an unknown sort to 'recent' via parseRatingSort", async () => {
    await loadMorePublicRecipesAction(0, "wild" as RatingSort);
    expect(listPublicRecipesMock).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "recent" }),
    );
  });

  it("preserves a valid 'top-rated' sort", async () => {
    await loadMorePublicRecipesAction(0, "top-rated");
    expect(listPublicRecipesMock).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "top-rated" }),
    );
  });
});

describe("library filtering + pagination", () => {
  it("removes recipes already in the viewer's library", async () => {
    listPublicRecipesMock.mockResolvedValue(page(["r1", "r2", "r3"]));
    listLibraryMock.mockResolvedValue([{ id: "r2" }]);

    const result = await loadMorePublicRecipesAction(0);

    expect(result.items.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("preserves the underlying page's nextOffset", async () => {
    listPublicRecipesMock.mockResolvedValue(page(["r1"], 99));
    const result = await loadMorePublicRecipesAction(0);
    expect(result.nextOffset).toBe(99);
  });
});

describe("signed-out viewer", () => {
  it("works when getCurrentUser returns null (no throw, library derived from null)", async () => {
    useAuthMock(null);
    listPublicRecipesMock.mockResolvedValue(page(["r1", "r2"]));
    listLibraryMock.mockResolvedValue([]);

    const result = await loadMorePublicRecipesAction(0);

    expect(listLibraryMock).toHaveBeenCalledWith(null);
    expect(result.items.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});
