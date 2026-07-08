import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Cook Mode calls useRouter() for the "Done" flow; stub it so the immersive
// chrome renders in jsdom without the App Router runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { CookExperience } from "./cook-experience";
import type { CookRecipe } from "./types";

afterEach(cleanup);

function makeRecipe(overrides: Partial<CookRecipe> = {}): CookRecipe {
  return {
    id: "recipe-1",
    slug: "sunday-sauce",
    title: "Sunday Sauce",
    description: null,
    coverImageUrl: null,
    servings: 4,
    servingsNoun: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    notes: null,
    householdId: null,
    ingredients: [],
    steps: [
      {
        id: "step-1",
        position: 1,
        section: null,
        instruction: "Brown the sausage.",
        imageUrl: null,
        videoUrl: null,
        timerSeconds: null,
        techniques: null,
      },
    ],
    ...overrides,
  };
}

describe("Cook Mode chrome safe-area insets (issue #283)", () => {
  it("pads the sticky footer so Previous/Next/Done clear the home indicator and side notch", () => {
    const { container } = render(<CookExperience recipe={makeRecipe()} />);
    const footer = container.querySelector("footer");

    expect(footer).not.toBeNull();
    // Bottom padding is at least the home-indicator inset, floored at the
    // original 0.75rem so non-notched devices/desktop are unchanged (inset -> 0).
    expect(footer?.className).toContain(
      "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
    );
    expect(footer?.className).toContain("pt-3");
    // Landscape side notch: the primary controls never sit under a side inset.
    expect(footer?.className).toContain(
      "pl-[max(0.75rem,env(safe-area-inset-left))]",
    );
    expect(footer?.className).toContain(
      "pr-[max(0.75rem,env(safe-area-inset-right))]",
    );
    expect(footer?.className).toContain(
      "sm:pl-[max(1.25rem,env(safe-area-inset-left))]",
    );
    expect(footer?.className).toContain(
      "sm:pr-[max(1.25rem,env(safe-area-inset-right))]",
    );
  });

  it("pads the sticky header for the status bar and side notch", () => {
    const { container } = render(<CookExperience recipe={makeRecipe()} />);
    const header = container.querySelector("header");
    const row = header?.querySelector("div");

    expect(header).not.toBeNull();
    expect(header?.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(row?.className).toContain(
      "pl-[max(0.75rem,env(safe-area-inset-left))]",
    );
    expect(row?.className).toContain(
      "pr-[max(0.75rem,env(safe-area-inset-right))]",
    );
    expect(row?.className).toContain(
      "sm:pl-[max(1.25rem,env(safe-area-inset-left))]",
    );
    expect(row?.className).toContain(
      "sm:pr-[max(1.25rem,env(safe-area-inset-right))]",
    );
  });

  it("gives EmptyCookExperience the same top and side insets", () => {
    const { container } = render(
      <CookExperience recipe={makeRecipe({ steps: [] })} />,
    );
    const header = container.querySelector("header");
    const row = header?.querySelector("div");

    expect(header).not.toBeNull();
    expect(header?.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(row?.className).toContain(
      "pl-[max(1rem,env(safe-area-inset-left))]",
    );
    expect(row?.className).toContain(
      "pr-[max(1rem,env(safe-area-inset-right))]",
    );
  });
});
