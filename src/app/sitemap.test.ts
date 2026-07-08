import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/server/recipes/queries", () => ({
  listPublicRecipeSlugs: vi.fn(),
}));

import sitemap from "./sitemap";
import { listPublicRecipeSlugs } from "~/server/recipes/queries";

const mockList = vi.mocked(listPublicRecipeSlugs);

describe("sitemap", () => {
  beforeEach(() => mockList.mockReset());

  it("lists static routes plus every public recipe with lastModified", async () => {
    const updatedAt = new Date("2024-05-02T10:00:00.000Z");
    mockList.mockResolvedValue([
      { slug: "peach-cobbler", updatedAt },
      { slug: "sourdough", updatedAt: new Date("2024-01-01T00:00:00.000Z") },
    ]);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/recipes"))).toBe(true);

    const cobbler = entries.find((e) => e.url.endsWith("/recipes/peach-cobbler"));
    expect(cobbler).toBeDefined();
    expect(cobbler!.lastModified).toEqual(updatedAt);
    expect(entries).toHaveLength(4);
  });

  it("emits only static routes when there are no public recipes", async () => {
    mockList.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries).toHaveLength(2);
  });
});
