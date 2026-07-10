import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DinnerSuggestion } from "./dinner-suggestion";
import { addEntryAction } from "~/server/planner/actions";
import type { DinnerCandidate } from "~/server/recipes/queries";

type ActionResult = { ok: boolean; error?: string };

vi.mock("~/server/planner/actions", () => ({
  addEntryAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => {
      toastSuccess(m);
    },
    error: (m: string) => {
      toastError(m);
    },
  },
}));

const mockedAddEntry = vi.mocked(addEntryAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const candidate = (id: string, title: string): DinnerCandidate => ({
  id,
  slug: id,
  title,
  coverImageUrl: null,
  totalMinutes: 30,
  difficulty: "easy",
});

const TWO = [
  candidate("tacos", "Taco night"),
  candidate("pasta", "Weeknight pasta"),
];

describe("DinnerSuggestion (#375)", () => {
  it("prompts to create/browse when there are no candidates", () => {
    render(<DinnerSuggestion candidates={[]} today="2026-07-06" />);
    expect(
      screen.queryByRole("button", { name: /pick my dinner/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a recipe/i })).toHaveAttribute(
      "href",
      "/recipes/new",
    );
    expect(
      screen.getByRole("link", { name: /browse recipes/i }),
    ).toHaveAttribute("href", "/recipes");
  });

  it("reveals one recipe with Cook + add-to-tonight actions", async () => {
    const user = userEvent.setup();
    mockedAddEntry.mockResolvedValue({ ok: true });
    render(<DinnerSuggestion candidates={TWO} today="2026-07-06" />);

    await user.click(screen.getByRole("button", { name: /pick my dinner/i }));

    const cook = screen.getByRole("link", { name: /^cook$/i });
    expect(cook.getAttribute("href")).toMatch(
      /\/recipes\/(tacos|pasta)\/cook$/,
    );

    await user.click(
      screen.getByRole("button", { name: /add to tonight's plan/i }),
    );
    await waitFor(() => expect(mockedAddEntry).toHaveBeenCalledTimes(1));
    const call = mockedAddEntry.mock.calls[0]![0] as {
      date: string;
      slot: string;
      recipeId: string;
    };
    expect(call.date).toBe("2026-07-06");
    expect(call.slot).toBe("dinner");
    expect(["tacos", "pasta"]).toContain(call.recipeId);
    expect(
      await screen.findByRole("button", { name: /on tonight's plan/i }),
    ).toBeInTheDocument();
  });

  it("reshuffles to the other candidate on 'pick again'", async () => {
    const user = userEvent.setup();
    render(<DinnerSuggestion candidates={TWO} today="2026-07-06" />);

    await user.click(screen.getByRole("button", { name: /pick my dinner/i }));
    const firstTitle = screen.getByRole("link", {
      name: /taco night|weeknight pasta/i,
    }).textContent;

    await user.click(screen.getByRole("button", { name: /pick again/i }));
    const secondTitle = screen.getByRole("link", {
      name: /taco night|weeknight pasta/i,
    }).textContent;

    expect(secondTitle).not.toBe(firstTitle);
  });

  it("hides 'pick again' when there is only one candidate", async () => {
    const user = userEvent.setup();
    render(
      <DinnerSuggestion
        candidates={[candidate("solo", "Solo stew")]}
        today="2026-07-06"
      />,
    );
    await user.click(screen.getByRole("button", { name: /pick my dinner/i }));
    expect(
      screen.queryByRole("button", { name: /pick again/i }),
    ).not.toBeInTheDocument();
  });

  it("surfaces an add-to-plan error", async () => {
    const user = userEvent.setup();
    mockedAddEntry.mockResolvedValue({ ok: false, error: "No plan today" });
    render(<DinnerSuggestion candidates={TWO} today="2026-07-06" />);

    await user.click(screen.getByRole("button", { name: /pick my dinner/i }));
    await user.click(
      screen.getByRole("button", { name: /add to tonight's plan/i }),
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("No plan today"),
    );
  });
});
