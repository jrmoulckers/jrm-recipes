import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const logCookAction = vi.fn();
const removeEntryAction = vi.fn();
const addEntryAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("~/server/cooklog/actions", () => ({
  logCookAction: (...args: unknown[]) => logCookAction(...args),
}));

vi.mock("~/server/planner/actions", () => ({
  removeEntryAction: (...args: unknown[]) => removeEntryAction(...args),
  addEntryAction: (...args: unknown[]) => addEntryAction(...args),
}));

import { PlannerBoard, type BoardDay, type BoardEntry } from "./planner-board";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const days: BoardDay[] = [
  {
    dateParam: "2026-07-06",
    weekdayLabel: "Mon",
    dayNumber: "6",
    fullLabel: "Monday, Jul 6",
    isToday: false,
  },
];

function recipeEntry(overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: "entry-1",
    dateParam: "2026-07-06",
    slot: "dinner",
    note: null,
    recipe: { id: "recipe-1", slug: "chili", title: "Weeknight Chili" },
    ...overrides,
  };
}

const noteEntry: BoardEntry = {
  id: "entry-2",
  dateParam: "2026-07-06",
  slot: "dinner",
  note: "Order pizza",
  recipe: null,
};

describe("PlannerBoard — Cooked it (#422)", () => {
  it("shows a Cooked it action for recipe entries", () => {
    render(<PlannerBoard days={days} entries={[recipeEntry()]} recipes={[]} />);
    expect(
      screen.getByRole("button", { name: /cooked it/i }),
    ).toBeInTheDocument();
  });

  it("does not show Cooked it for note-only entries", () => {
    render(<PlannerBoard days={days} entries={[noteEntry]} recipes={[]} />);
    expect(
      screen.queryByRole("button", { name: /cooked it/i }),
    ).not.toBeInTheDocument();
  });

  it("logs the cook dated to the entry's day and marks it cooked", async () => {
    logCookAction.mockResolvedValue({ ok: true });
    render(<PlannerBoard days={days} entries={[recipeEntry()]} recipes={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /cooked it/i }));

    await waitFor(() =>
      expect(logCookAction).toHaveBeenCalledWith({
        recipeId: "recipe-1",
        recipeSlug: "chili",
        cookedAt: "2026-07-06",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /cooked it/i }),
      ).not.toBeInTheDocument(),
    );
  });
});
