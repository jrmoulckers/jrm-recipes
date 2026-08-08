import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { IntlWrapper } from "~/test/intl";

type ActionResult = { ok: boolean; error?: string };
const logCookAction = vi.fn<(input: unknown) => Promise<ActionResult>>();
const removeEntryAction = vi.fn<(input: unknown) => Promise<ActionResult>>();
const addEntryAction = vi.fn<(input: unknown) => Promise<ActionResult>>();
const addMealWithLeftoversAction =
  vi.fn<(input: unknown) => Promise<ActionResult>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("~/server/cooklog/actions", () => ({
  logCookAction: (input: unknown) => logCookAction(input),
}));

vi.mock("~/server/planner/actions", () => ({
  removeEntryAction: (input: unknown) => removeEntryAction(input),
  addEntryAction: (input: unknown) => addEntryAction(input),
  addMealWithLeftoversAction: (input: unknown) =>
    addMealWithLeftoversAction(input),
}));

import { PlannerBoard, type BoardDay, type BoardEntry } from "./planner-board";
import { formatLeftoversNote } from "~/lib/planner-batch";

/** Render inside the intl provider. PlannerBoard reads the locale via next-intl. */
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
    dateParam: "2026-07-07",
    weekdayLabel: "Tue",
    dayNumber: "7",
    fullLabel: "Tuesday, Jul 7",
    isToday: false,
  },
  {
    dateParam: "2026-07-08",
    weekdayLabel: "Wed",
    dayNumber: "8",
    fullLabel: "Wednesday, Jul 8",
    isToday: false,
  },
  {
    dateParam: "2026-07-09",
    weekdayLabel: "Thu",
    dayNumber: "9",
    fullLabel: "Thursday, Jul 9",
    isToday: false,
  },
];

function recipeEntry(overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: "entry-1",
    dateParam: "2026-07-06",
    slot: "dinner",
    note: null,
    plannedServings: null,
    servingsMade: null,
    leftoverSourceId: null,
    recipe: { id: "recipe-1", slug: "chili", title: "Weeknight Chili" },
    ...overrides,
  };
}

const noteEntry: BoardEntry = {
  id: "entry-2",
  dateParam: "2026-07-06",
  slot: "dinner",
  note: "Order pizza",
  plannedServings: null,
  servingsMade: null,
  leftoverSourceId: null,
  recipe: null,
};

describe("PlannerBoard. Cooked it (#422)", () => {
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

describe("PlannerBoard. Batch cook / leftovers (#380)", () => {
  const primary = recipeEntry();
  const leftovers: BoardEntry = {
    id: "entry-left",
    dateParam: "2026-07-08",
    slot: "dinner",
    note: formatLeftoversNote("Weeknight Chili", 2),
    plannedServings: null,
    servingsMade: null,
    leftoverSourceId: null,
    recipe: { id: "recipe-1", slug: "chili", title: "Weeknight Chili" },
  };

  it("marks the primary with a batch badge and the linked night as leftovers", () => {
    render(
      <PlannerBoard
        days={weekDays}
        entries={[primary, leftovers]}
        recipes={[]}
      />,
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
      <PlannerBoard
        days={weekDays}
        entries={[primary, leftovers]}
        recipes={[]}
      />,
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

  it("plans exact servings across any source and destination meal", async () => {
    addMealWithLeftoversAction.mockResolvedValue({ ok: true });
    render(
      <PlannerBoard
        days={weekDays}
        entries={[]}
        recipes={[
          {
            id: "recipe-1",
            title: "Weeknight Chili",
            slug: "chili",
            defaultServings: 4,
            lastServings: null,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /add to lunch on monday, jul 6/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /weeknight chili/i }),
    );

    fireEvent.change(screen.getByLabelText(/servings for this meal/i), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add leftover meal/i }));
    fireEvent.click(screen.getByRole("button", { name: /add leftover meal/i }));

    const dates = screen.getAllByLabelText(/^date$/i);
    fireEvent.change(dates[0]!, { target: { value: "2026-07-07" } });
    fireEvent.change(dates[1]!, { target: { value: "2026-07-09" } });
    const meals = screen.getAllByLabelText(/^meal$/i);
    fireEvent.change(meals[0]!, { target: { value: "lunch" } });
    fireEvent.change(meals[1]!, { target: { value: "dinner" } });
    const servings = screen.getAllByLabelText(/^servings$/i);
    fireEvent.change(servings[0]!, { target: { value: "1" } });
    fireEvent.change(servings[1]!, { target: { value: "2" } });

    expect(screen.getByText(/make 6 servings total/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add to plan/i }));

    await waitFor(() =>
      expect(addMealWithLeftoversAction).toHaveBeenCalledWith({
        date: "2026-07-06",
        slot: "lunch",
        recipeId: "recipe-1",
        groupId: undefined,
        note: undefined,
        mealServings: 3,
        leftovers: [
          { date: "2026-07-07", slot: "lunch", servings: 1 },
          { date: "2026-07-09", slot: "dinner", servings: 2 },
        ],
      }),
    );
  });

  it("only offers leftover meals after the source meal", async () => {
    render(
      <PlannerBoard
        days={weekDays}
        entries={[]}
        recipes={[
          {
            id: "recipe-1",
            title: "Weeknight Chili",
            slug: "chili",
            defaultServings: 4,
            lastServings: null,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /add to dinner on wednesday, jul 8/i,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /weeknight chili/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /add leftover meal/i }));

    const date = screen.getByLabelText(/^date$/i);
    expect(date).toHaveValue("2026-07-09");
    expect(screen.queryByRole("option", { name: /monday, jul 6/i })).toBeNull();
    expect(
      screen.queryByRole("option", { name: /tuesday, jul 7/i }),
    ).toBeNull();
    expect(
      screen.getByRole("option", { name: /thursday, jul 9/i }),
    ).toBeInTheDocument();

    fireEvent.change(date, { target: { value: "2026-07-08" } });
    const meal = screen.getByLabelText(/^meal$/i);
    expect(meal).toHaveValue("snack");
    expect(screen.queryByRole("option", { name: /^breakfast$/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /^lunch$/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /^dinner$/i })).toBeNull();
  });

  it("prefills the latest serving count ahead of the recipe default", async () => {
    render(
      <PlannerBoard
        days={weekDays}
        entries={[]}
        recipes={[
          {
            id: "recipe-1",
            title: "Weeknight Chili",
            slug: "chili",
            defaultServings: 4,
            lastServings: 6,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /add to breakfast on monday/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /weeknight chili/i }),
    );

    expect(screen.getByLabelText(/servings for this meal/i)).toHaveValue(6);
    expect(
      screen.getByText(/you made 6 servings last time/i),
    ).toBeInTheDocument();
  });
});

describe("PlannerBoard. Serving allocations (#611)", () => {
  const source = recipeEntry({
    plannedServings: 3,
    servingsMade: 6,
  });
  const lunch: BoardEntry = recipeEntry({
    id: "entry-lunch",
    dateParam: "2026-07-07",
    slot: "lunch",
    plannedServings: 1,
    leftoverSourceId: source.id,
  });
  const dinner: BoardEntry = recipeEntry({
    id: "entry-dinner",
    dateParam: "2026-07-09",
    slot: "dinner",
    plannedServings: 2,
    leftoverSourceId: source.id,
  });

  it("shows total servings on the cook and servings on every destination", () => {
    render(
      <PlannerBoard
        days={weekDays}
        entries={[source, lunch, dinner]}
        recipes={[]}
      />,
    );

    expect(screen.getByText(/make 6 servings · 3 saved/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^leftovers$/i)).toHaveLength(2);
    expect(screen.getByText(/^1 serving$/i)).toBeInTheDocument();
    expect(screen.getByText(/^2 servings$/i)).toBeInTheDocument();
  });

  it("removes every linked allocation through the source meal", async () => {
    removeEntryAction.mockResolvedValue({ ok: true });
    render(
      <PlannerBoard
        days={weekDays}
        entries={[source, lunch, dinner]}
        recipes={[]}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /remove weeknight chili from plan/i,
      })[0]!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /remove all 3 meals/i }),
    );

    await waitFor(() =>
      expect(removeEntryAction).toHaveBeenCalledWith({
        entryId: "entry-1",
        removeAllocations: true,
      }),
    );
    expect(removeEntryAction).toHaveBeenCalledTimes(1);
  });
});
