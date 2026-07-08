import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const getPublicRecipeCard = vi.hoisted(() => vi.fn());

vi.mock("~/server/recipes/queries", () => ({
  getPublicRecipeCard,
}));

const ORIGIN = "http://localhost:3000";

function get(query: string): Promise<Response> {
  return GET(new Request(`${ORIGIN}/api/oembed${query}`));
}

beforeEach(() => {
  getPublicRecipeCard.mockReset();
});

describe("GET /api/oembed", () => {
  it("returns a rich payload for a public recipe", async () => {
    getPublicRecipeCard.mockResolvedValue({
      slug: "apple-pie",
      title: "Apple Pie",
      coverImageUrl: null,
      author: { name: "Ada", handle: "ada" },
    });

    const res = await get(
      `?url=${encodeURIComponent(`${ORIGIN}/recipes/apple-pie`)}&format=json`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("rich");
    expect(body.title).toBe("Apple Pie");
    expect(body.html).toContain("/embed/recipes/apple-pie");
    expect(getPublicRecipeCard).toHaveBeenCalledWith("apple-pie");
  });

  it("400s when url is missing", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect(getPublicRecipeCard).not.toHaveBeenCalled();
  });

  it("501s for non-json formats", async () => {
    const res = await get(
      `?url=${encodeURIComponent(`${ORIGIN}/recipes/apple-pie`)}&format=xml`,
    );
    expect(res.status).toBe(501);
    expect(getPublicRecipeCard).not.toHaveBeenCalled();
  });

  it("404s for a foreign-origin url without touching the DB", async () => {
    const res = await get(
      `?url=${encodeURIComponent("https://evil.example.com/recipes/apple-pie")}`,
    );
    expect(res.status).toBe(404);
    expect(getPublicRecipeCard).not.toHaveBeenCalled();
  });

  it("404s when the recipe is not public", async () => {
    getPublicRecipeCard.mockResolvedValue(null);
    const res = await get(
      `?url=${encodeURIComponent(`${ORIGIN}/recipes/secret`)}`,
    );
    expect(res.status).toBe(404);
  });
});
