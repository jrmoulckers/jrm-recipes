import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RatingSort } from "~/lib/ratings";

/**
 * Unit tests for `loadMorePublicRecipesAction` (issues #228, #67): the "Load
 * more" pagination on `/recipes`. It clamps a possibly-malformed offset,
 * sanitizes the sort, re-derives the viewer server-side, and hides recipes
 * already in the viewer's library. When a page is *entirely* the viewer's own
 * recipes it keeps paging so the button never adds zero cards yet persists
 * (#67). Auth + queries are mocked; the real `parseRatingSort` runs.
 */

vi.mock("~/server/auth", async () =>
  (await import("~/test/harness")).authModuleMock(),
);

const { listPublicRecipesMock, listLibraryRecipeIdsMock } = vi.hoisted(() => ({
  listPublicRecipesMock: vi.fn(),
  listLibraryRecipeIdsMock: vi.fn(),
}));

vi.mock("./queries", () => ({
  listPublicRecipes: listPublicRecipesMock,
  listLibraryRecipeIds: listLibraryRecipeIdsMock,
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
  listLibraryRecipeIdsMock.mockResolvedValue([]);
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
    listLibraryRecipeIdsMock.mockResolvedValue(["r2"]);

    const result = await loadMorePublicRecipesAction(0);

    expect(result.items.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("preserves the underlying page's nextOffset", async () => {
    listPublicRecipesMock.mockResolvedValue(page(["r1"], 99));
    const result = await loadMorePublicRecipesAction(0);
    expect(result.nextOffset).toBe(99);
  });
});

describe("empty post-filter page (#67)", () => {
  it("keeps paging past a page the viewer owns entirely, then returns the next page's offset", async () => {
    // The viewer authored every recipe on the first raw page.
    listLibraryRecipeIdsMock.mockResolvedValue(["r1", "r2"]);
    listPublicRecipesMock
      .mockResolvedValueOnce(page(["r1", "r2"], 24))
      .mockResolvedValueOnce(page(["r5"], 48));

    const result = await loadMorePublicRecipesAction(0);

    // Skips the all-owned first page instead of returning zero cards, and
    // advances the offset past the page it actually consumed.
    expect(result.items.map((r) => r.id)).toEqual(["r5"]);
    expect(result.nextOffset).toBe(48);
    expect(listPublicRecipesMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ offset: 0 }),
    );
    expect(listPublicRecipesMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 24 }),
    );
  });

  it("hides the button when the remaining feed is entirely the viewer's own recipes", async () => {
    listLibraryRecipeIdsMock.mockResolvedValue(["r1"]);
    // A short final page (nextOffset null) that filters to nothing.
    listPublicRecipesMock.mockResolvedValue(page(["r1"], null));

    const result = await loadMorePublicRecipesAction(0);

    expect(result.items).toEqual([]);
    expect(result.nextOffset).toBeNull();
  });
});

describe("signed-out viewer", () => {
  it("works when getCurrentUser returns null (no throw, library derived from null)", async () => {
    useAuthMock(null);
    listPublicRecipesMock.mockResolvedValue(page(["r1", "r2"]));
    listLibraryRecipeIdsMock.mockResolvedValue([]);

    const result = await loadMorePublicRecipesAction(0);

    expect(listLibraryRecipeIdsMock).toHaveBeenCalledWith(null);
    expect(result.items.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});
