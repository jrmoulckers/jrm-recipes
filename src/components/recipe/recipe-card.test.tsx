import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeCard, type CardRecipe } from "./recipe-card";

// RecipeCard imports FavoriteButton, which pulls in a server action + router;
// stub the pieces so the card can render in jsdom.
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
  // A `priority` next/image injects a preload <link> into <head> via React's
  // resource system; drop them between tests so each asserts a clean head.
  document.head
    .querySelectorAll('link[rel="preload"][as="image"]')
    .forEach((el) => el.remove());
});

function makeRecipe(overrides: Partial<CardRecipe> = {}): CardRecipe {
  return {
    id: "r1",
    slug: "sourdough",
    title: "Sourdough",
    description: "Crusty loaf",
    coverImageUrl: "https://img.test/default.jpg",
    totalMinutes: 120,
    servings: 2,
    difficulty: "medium",
    visibility: "public",
    ...overrides,
  };
}

/** Image preload hints (`<link rel="preload" as="image">`) currently in <head>. */
function preloadImageLinks() {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="preload"][as="image"]',
    ),
  );
}

describe("RecipeCard LCP priority", () => {
  it("lazy-loads the cover image by default (below-the-fold cards)", () => {
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe({ coverImageUrl: "https://img.test/lazy-card.jpg" })}
      />,
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(
      preloadImageLinks().some((l) =>
        l.getAttribute("imagesrcset")?.includes("lazy-card.jpg"),
      ),
    ).toBe(false);
  });

  it("eagerly loads and preloads the cover image when priority is set (LCP)", () => {
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe({ coverImageUrl: "https://img.test/lcp-card.jpg" })}
        priority
      />,
    );

    const img = container.querySelector("img");
    // next/image omits the loading attribute for priority images (eager).
    expect(img).not.toHaveAttribute("loading", "lazy");
    // The prioritized image gets a preload hint so it isn't blocked by hydration.
    expect(
      preloadImageLinks().some((l) =>
        l.getAttribute("imagesrcset")?.includes("lcp-card.jpg"),
      ),
    ).toBe(true);
  });

  it("renders no image or preload when the recipe has no cover", () => {
    const { container } = render(
      <RecipeCard recipe={makeRecipe({ coverImageUrl: null })} priority />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(preloadImageLinks()).toHaveLength(0);
  });
});
