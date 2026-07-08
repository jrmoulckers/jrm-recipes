import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { IntlWrapper } from "~/test/intl";
import { ThemeProvider } from "~/components/theme/theme-provider";

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

// ThemeProvider effects lean on matchMedia, which jsdom does not implement.
beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

// Cook mode reads the active locale (useCookSession → useLocale) to pick a
// default measurement system, so every render needs the intl provider.
function render(ui: React.ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

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
    nutrition: {},
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

describe("Cook Mode large-target flag (issue #439)", () => {
  function renderWithTheme(ui: React.ReactElement, theme: "kitchen" | "kids") {
    return rtlRender(
      <IntlWrapper>
        <ThemeProvider initialTheme={theme}>{ui}</ThemeProvider>
      </IntlWrapper>,
    );
  }

  it("upsizes Previous/Next to kid-sized targets in Kids mode", () => {
    renderWithTheme(<CookExperience recipe={makeRecipe()} />, "kids");
    const previous = screen.getByRole("button", { name: "Previous" });
    // makeRecipe has a single step, so the primary action reads "Done".
    const done = screen.getByRole("button", { name: "Done" });

    // The kid target is taller than the default footer button on every width.
    expect(previous.className).toContain("sm:h-20");
    expect(previous.className).toContain("text-xl");
    expect(done.className).toContain("sm:h-20");
  });

  it("keeps the default control sizing outside Kids mode (no regression)", () => {
    renderWithTheme(<CookExperience recipe={makeRecipe()} />, "kitchen");
    const previous = screen.getByRole("button", { name: "Previous" });

    expect(previous.className).toContain("h-16");
    expect(previous.className).not.toContain("sm:h-20");
  });
});
