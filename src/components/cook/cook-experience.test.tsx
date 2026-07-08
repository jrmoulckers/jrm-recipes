import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// Isolate the per-session "get ready" gate memory (#444) between tests.
beforeEach(() => {
  try {
    sessionStorage.clear();
  } catch {
    /* no-op */
  }
});

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
    // Skip the Kids-mode "get ready" gate (#444) so these assert step-1 chrome.
    if (theme === "kids") {
      sessionStorage.setItem("heirloom-precook-ready:recipe-1", "1");
    }
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

describe("Cook Mode kid-safety callout (issue #423)", () => {
  function renderWithTheme(ui: React.ReactElement, theme: "kitchen" | "kids") {
    // Skip the Kids-mode "get ready" gate (#444) so these assert step-1 chrome.
    if (theme === "kids") {
      sessionStorage.setItem("heirloom-precook-ready:recipe-1", "1");
    }
    return rtlRender(
      <IntlWrapper>
        <ThemeProvider initialTheme={theme}>{ui}</ThemeProvider>
      </IntlWrapper>,
    );
  }

  const hotRecipe = () =>
    makeRecipe({
      steps: [
        {
          id: "step-1",
          position: 1,
          section: null,
          instruction: "Fry the onions in the hot pan.",
          imageUrl: null,
          videoUrl: null,
          timerSeconds: null,
          techniques: ["Sauté"],
        },
      ],
    });

  it("warns to ask a grown-up on a hot step in Kids mode", () => {
    renderWithTheme(<CookExperience recipe={hotRecipe()} />, "kids");
    expect(
      screen.getByRole("note", { name: /this step is hot/i }),
    ).toBeInTheDocument();
  });

  it("does not show the callout outside Kids mode", () => {
    renderWithTheme(<CookExperience recipe={hotRecipe()} />, "kitchen");
    expect(screen.queryByRole("note", { name: /hot|sharp/i })).toBeNull();
  });

  it("shows no callout on a plain step in Kids mode (no false alarms)", () => {
    renderWithTheme(<CookExperience recipe={makeRecipe()} />, "kids");
    expect(screen.queryByRole("note", { name: /hot|sharp/i })).toBeNull();
  });
});

describe("Cook Mode get-ready gate (issue #444)", () => {
  function renderKids(recipe: CookRecipe) {
    return rtlRender(
      <IntlWrapper>
        <ThemeProvider initialTheme="kids">
          <CookExperience recipe={recipe} />
        </ThemeProvider>
      </IntlWrapper>,
    );
  }

  it("shows the 'Let's get ready!' checklist before step 1 in Kids mode", () => {
    renderKids(makeRecipe());
    expect(
      screen.getByRole("heading", { name: /let's get ready/i }),
    ).toBeInTheDocument();
    // The step-1 chrome isn't rendered until the child proceeds.
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("shows the grown-up-help item only when the recipe has risky steps", () => {
    const { unmount } = renderKids(makeRecipe()); // "Brown the sausage." — safe
    expect(screen.queryByText(/cook with a grown-up/i)).toBeNull();
    unmount();

    renderKids(
      makeRecipe({
        steps: [
          {
            id: "step-1",
            position: 1,
            section: null,
            instruction: "Fry the onions.",
            imageUrl: null,
            videoUrl: null,
            timerSeconds: null,
            techniques: null,
          },
        ],
      }),
    );
    expect(screen.getByText(/cook with a grown-up/i)).toBeInTheDocument();
  });

  it("proceeds into step 1 when the child taps the ready button", () => {
    renderKids(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: /let's cook/i }));

    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /let's get ready/i }),
    ).toBeNull();
  });

  it("goes straight to step 1 in grown-up modes (no gate)", () => {
    rtlRender(
      <IntlWrapper>
        <ThemeProvider initialTheme="kitchen">
          <CookExperience recipe={makeRecipe()} />
        </ThemeProvider>
      </IntlWrapper>,
    );
    expect(
      screen.queryByRole("heading", { name: /let's get ready/i }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("remembers the choice for the session so it doesn't nag again", () => {
    const recipe = makeRecipe();
    const first = renderKids(recipe);
    fireEvent.click(screen.getByRole("button", { name: /let's cook/i }));
    first.unmount();

    // Re-entering the same recipe's cook session skips the gate.
    renderKids(recipe);
    expect(
      screen.queryByRole("heading", { name: /let's get ready/i }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});
