import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import type { CookRecipe, CookStep } from "./types";

afterEach(cleanup);

function makeStep(overrides: Partial<CookStep> = {}): CookStep {
  return {
    id: "step-1",
    position: 1,
    section: null,
    instruction: "Brown the sausage.",
    imageUrl: null,
    videoUrl: null,
    timerSeconds: null,
    techniques: null,
    ...overrides,
  };
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
    steps: [makeStep()],
    ...overrides,
  };
}

describe("Cook Mode accessible names (issue #119)", () => {
  it("names the step timer region with what it is timing and time remaining", () => {
    render(
      <CookExperience
        recipe={makeRecipe({
          steps: [makeStep({ timerSeconds: 600 })],
        })}
      />,
    );

    const timer = screen.getByRole("timer");
    // Not a bare "timer" — the name says what it times and the remaining time.
    expect(timer).toHaveAccessibleName(/^Step timer, \d+:\d{2} remaining$/);
  });

  it("gives overview step buttons a descriptive name and marks the current step", async () => {
    const user = userEvent.setup();
    render(
      <CookExperience
        recipe={makeRecipe({
          steps: [
            makeStep({ id: "s1", instruction: "Brown the sausage." }),
            makeStep({
              id: "s2",
              position: 2,
              section: "Sauce",
              instruction: "Simmer the tomatoes.",
            }),
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /overview/i }));

    // Names carry the step number AND its section/instruction — never "button, 1".
    const first = screen.getByRole("button", {
      name: "Go to step 1: Brown the sausage.",
    });
    const second = screen.getByRole("button", {
      name: "Go to step 2: Sauce",
    });

    // The current step is programmatically indicated.
    expect(first).toHaveAttribute("aria-current", "step");
    expect(second).not.toHaveAttribute("aria-current");
  });
});
