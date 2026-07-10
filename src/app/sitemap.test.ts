import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/server/recipes/queries", () => ({
  listPublicRecipeSlugs: vi.fn(),
}));

vi.mock("~/server/users/queries", () => ({
  listPublicCookHandles: vi.fn(),
}));

import sitemap from "./sitemap";
import { listPublicRecipeSlugs } from "~/server/recipes/queries";
import { listPublicCookHandles } from "~/server/users/queries";

const mockList = vi.mocked(listPublicRecipeSlugs);
const mockHandles = vi.mocked(listPublicCookHandles);

describe("sitemap", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockHandles.mockReset();
    mockHandles.mockResolvedValue([]);
  });

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

    const cobbler = entries.find((e) =>
      e.url.endsWith("/recipes/peach-cobbler"),
    );
    expect(cobbler).toBeDefined();
    expect(cobbler!.lastModified).toEqual(updatedAt);
    expect(entries).toHaveLength(5);
  });

  it("includes public cook profiles", async () => {
    mockList.mockResolvedValue([]);
    mockHandles.mockResolvedValue(["auntmay", "chefbo"]);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/cooks/auntmay"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/cooks/chefbo"))).toBe(true);
  });

  it("emits only static routes when there is no public content", async () => {
    mockList.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries).toHaveLength(3);
  });

  it("includes the discover surface among the static routes", async () => {
    mockList.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith("/discover"))).toBe(true);
  });
});
