import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoverFeed } from "./discover-feed";
import { type CardRecipe } from "./recipe-card";

vi.mock("~/server/recipes/discover-actions", () => ({
  loadMorePublicRecipesAction: vi.fn(),
}));

vi.mock("~/server/collections/actions", () => ({
  toggleFavoriteAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  document.head
    .querySelectorAll('link[rel="preload"][as="image"]')
    .forEach((el) => el.remove());
});

function makeItems(count: number): CardRecipe[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    slug: `recipe-${i}`,
    title: `Recipe ${i}`,
    description: null,
    coverImageUrl: `https://img.test/card-${i}.jpg`,
    totalMinutes: null,
    servings: null,
    difficulty: null,
    visibility: "public",
  }));
}

describe("DiscoverFeed LCP priority", () => {
  it("prioritizes only the first priorityCount cards and lazy-loads the rest", () => {
    const { container } = render(
      <DiscoverFeed
        initialItems={makeItems(5)}
        initialNextOffset={null}
        priorityCount={3}
      />,
    );

    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(5);

    // First row (indices 0-2) render eagerly for LCP.
    for (const img of imgs.slice(0, 3)) {
      expect(img).not.toHaveAttribute("loading", "lazy");
    }
    // Everything after the first row stays lazy.
    for (const img of imgs.slice(3)) {
      expect(img).toHaveAttribute("loading", "lazy");
    }

    // Exactly the first three images get a preload hint.
    const preloads = document.head.querySelectorAll(
      'link[rel="preload"][as="image"]',
    );
    expect(preloads).toHaveLength(3);
  });

  it("keeps every card lazy when priorityCount is 0 (below-the-fold feed)", () => {
    const { container } = render(
      <DiscoverFeed initialItems={makeItems(3)} initialNextOffset={null} />,
    );

    for (const img of container.querySelectorAll("img")) {
      expect(img).toHaveAttribute("loading", "lazy");
    }
    expect(
      document.head.querySelectorAll('link[rel="preload"][as="image"]'),
    ).toHaveLength(0);
  });
});
