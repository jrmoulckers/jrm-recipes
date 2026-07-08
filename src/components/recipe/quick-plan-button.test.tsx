import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { QuickPlanButton } from "./quick-plan-button";
import { addEntryAction } from "~/server/planner/actions";

type ActionResult = { ok: boolean; error?: string };

vi.mock("~/server/planner/actions", () => ({
  addEntryAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
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

// Radix Popover relies on pointer-capture + scrollIntoView, absent in jsdom.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DAYS = [
  { value: "2026-07-06", label: "Mon, Jul 6" },
  { value: "2026-07-07", label: "Tue, Jul 7" },
  { value: "2026-07-08", label: "Wed, Jul 8" },
];

function renderButton() {
  return render(
    <QuickPlanButton
      recipeId="r1"
      recipeTitle="Sheet-pan chicken"
      days={DAYS}
      defaultDate="2026-07-07"
    />,
  );
}

describe("QuickPlanButton (#379)", () => {
  it("renders a compact add-to-plan trigger", () => {
    renderButton();
    expect(
      screen.getByRole("button", { name: /add to this week's plan/i }),
    ).toBeInTheDocument();
  });

  it("submits the pre-selected next-empty dinner via addEntryAction", async () => {
    const user = userEvent.setup();
    mockedAddEntry.mockResolvedValue({ ok: true });
    renderButton();

    await user.click(
      screen.getByRole("button", { name: /add to this week's plan/i }),
    );
    // Default day is the passed-in next empty dinner; slot defaults to dinner.
    await user.click(screen.getByRole("button", { name: /^add to plan$/i }));

    await waitFor(() => expect(mockedAddEntry).toHaveBeenCalledTimes(1));
    expect(mockedAddEntry).toHaveBeenCalledWith({
      date: "2026-07-07",
      slot: "dinner",
      recipeId: "r1",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0]![0]).toMatch(/Tue, Jul 7 dinner/);
  });

  it("honors a changed day and meal slot", async () => {
    const user = userEvent.setup();
    mockedAddEntry.mockResolvedValue({ ok: true });
    renderButton();

    await user.click(
      screen.getByRole("button", { name: /add to this week's plan/i }),
    );
    await user.selectOptions(screen.getByLabelText("Day"), "2026-07-06");
    await user.selectOptions(screen.getByLabelText("Meal"), "lunch");
    await user.click(screen.getByRole("button", { name: /^add to plan$/i }));

    await waitFor(() => expect(mockedAddEntry).toHaveBeenCalledWith({
      date: "2026-07-06",
      slot: "lunch",
      recipeId: "r1",
    }));
  });

  it("surfaces the action error without closing on failure", async () => {
    const user = userEvent.setup();
    mockedAddEntry.mockResolvedValue({ ok: false, error: "Nope" });
    renderButton();

    await user.click(
      screen.getByRole("button", { name: /add to this week's plan/i }),
    );
    await user.click(screen.getByRole("button", { name: /^add to plan$/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Nope"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
