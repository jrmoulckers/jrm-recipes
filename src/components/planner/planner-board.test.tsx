import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { IntlWrapper } from "~/test/intl";

type ActionResult = { ok: boolean; error?: string };
const logCookAction = vi.fn<(input: unknown) => Promise<ActionResult>>();
const removeEntryAction = vi.fn<(input: unknown) => Promise<ActionResult>>();
const addEntryAction = vi.fn<(input: unknown) => Promise<ActionResult>>();
const addBatchCookAction = vi.fn<(input: unknown) => Promise<ActionResult>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("~/server/cooklog/actions", () => ({
  logCookAction: (input: unknown) => logCookAction(input),
}));

vi.mock("~/server/planner/actions", () => ({
  removeEntryAction: (input: unknown) => removeEntryAction(input),
  addEntryAction: (input: unknown) => addEntryAction(input),
  addBatchCookAction: (input: unknown) => addBatchCookAction(input),
}));

import { PlannerBoard, type BoardDay, type BoardEntry } from "./planner-board";
import { formatLeftoversNote } from "~/lib/planner-batch";

/** Render inside the intl provider — PlannerBoard reads the locale via next-intl. */
function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

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

const weekDays: BoardDay[] = [
  {
    dateParam: "2026-07-06",
    weekdayLabel: "Mon",
    dayNumber: "6",
    fullLabel: "Monday, Jul 6",
    isToday: false,
  },
  {
    dateParam: "2026-07-08",
    weekdayLabel: "Wed",
    dayNumber: "8",
    fullLabel: "Wednesday, Jul 8",
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

describe("PlannerBoard — batch cook / leftovers (#380)", () => {
  const primary = recipeEntry();
  const leftovers: BoardEntry = {
    id: "entry-left",
    dateParam: "2026-07-08",
    slot: "dinner",
    note: formatLeftoversNote("Weeknight Chili", 2),
    recipe: { id: "recipe-1", slug: "chili", title: "Weeknight Chili" },
  };

  it("marks the primary with a batch badge and the linked night as leftovers", () => {
    render(
      <PlannerBoard days={weekDays} entries={[primary, leftovers]} recipes={[]} />,
    );
    expect(screen.getByText(/batch ×2/i)).toBeInTheDocument();
    // Wednesday's chip is styled as leftovers…
    expect(screen.getByText(/^leftovers$/i)).toBeInTheDocument();
    // …and never surfaces the raw encoded note.
    expect(screen.queryByText(/2× batch/i)).not.toBeInTheDocument();
  });

  it("does not offer Cooked it on a leftovers night", () => {
    render(<PlannerBoard days={weekDays} entries={[leftovers]} recipes={[]} />);
    expect(
      screen.queryByRole("button", { name: /cooked it/i }),
    ).not.toBeInTheDocument();
  });

  it("removing a batch primary offers to also remove the leftovers", async () => {
    removeEntryAction.mockResolvedValue({ ok: true });
    render(
      <PlannerBoard days={weekDays} entries={[primary, leftovers]} recipes={[]} />,
    );

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /remove weeknight chili from plan/i,
      })[0]!,
    );

    const both = await screen.findByRole("button", { name: /remove both/i });
    fireEvent.click(both);

    await waitFor(() =>
      expect(removeEntryAction).toHaveBeenCalledWith({ entryId: "entry-1" }),
    );
    expect(removeEntryAction).toHaveBeenCalledWith({ entryId: "entry-left" });
  });

  it("offers a batch-cook option for dinner and books both nights", async () => {
    addBatchCookAction.mockResolvedValue({ ok: true });
    render(
      <PlannerBoard
        days={weekDays}
        entries={[]}
        recipes={[{ id: "recipe-1", title: "Weeknight Chili", slug: "chili" }]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /add to dinner on monday, jul 6/i }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /weeknight chili/i }));

    const toggle = await screen.findByLabelText(/batch cook/i);
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("button", { name: /add to plan/i }));

    await waitFor(() =>
      expect(addBatchCookAction).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-07-06",
          slot: "dinner",
          recipeId: "recipe-1",
          leftoversDate: "2026-07-08",
          multiple: 2,
        }),
      ),
    );
  });
});
