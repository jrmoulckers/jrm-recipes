import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { revalidatePathMock, findManyMock, isDbConfiguredMock } = vi.hoisted(
  () => ({
    revalidatePathMock: vi.fn(),
    findManyMock: vi.fn(),
    isDbConfiguredMock: vi.fn(() => true),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("~/server/db", () => ({
  db: { query: { recipes: { findMany: findManyMock } } },
  isDbConfigured: isDbConfiguredMock,
}));

import { revalidateRecipePaths, revalidateRecipeSlugPaths } from "./revalidate";

beforeEach(() => {
  vi.clearAllMocks();
  isDbConfiguredMock.mockReturnValue(true);
  findManyMock.mockResolvedValue([]);
});

describe("revalidateRecipePaths", () => {
  it("busts both the canonical and the legacy flat path", () => {
    revalidateRecipePaths({ id: "rec_1", slug: "apple-pie", cook: "ada" });

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      "/recipes/ada/apple-pie",
      "/recipes/apple-pie",
    ]);
  });

  it("busts a single path when the cook slug is unknown", () => {
    revalidateRecipePaths({ id: "rec_1", slug: "apple-pie" });

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      "/recipes/apple-pie",
    ]);
  });
});

describe("revalidateRecipeSlugPaths", () => {
  it("busts the canonical path of every namespace holding the slug", async () => {
    // Slugs are unique per cook, so one slug can name several recipes. Missing
    // the right owner would leave that page stale, so all of them are busted.
    findManyMock.mockResolvedValue([
      { id: "rec_1", slug: "apple-pie", author: { slug: "ada" } },
      { id: "rec_2", slug: "apple-pie", author: { slug: "bo" } },
    ]);

    await revalidateRecipeSlugPaths("apple-pie");

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      "/recipes/apple-pie",
      "/recipes/ada/apple-pie",
      "/recipes/apple-pie",
      "/recipes/bo/apple-pie",
      "/recipes/apple-pie",
    ]);
  });

  it("still busts the legacy path without a database", async () => {
    isDbConfiguredMock.mockReturnValue(false);

    await revalidateRecipeSlugPaths("apple-pie");

    expect(revalidatePathMock.mock.calls.flat()).toEqual([
      "/recipes/apple-pie",
    ]);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
