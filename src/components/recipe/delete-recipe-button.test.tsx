import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteRecipeButton } from "./delete-recipe-button";
import {
  deleteRecipeAction,
  restoreRecipeAction,
} from "~/server/recipes/actions";

vi.mock("~/server/recipes/actions", () => ({
  deleteRecipeAction: vi.fn<(id: string) => Promise<void>>(),
  restoreRecipeAction: vi.fn<(id: string) => Promise<boolean>>(),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const toastFn = vi.fn((_message?: unknown, _options?: unknown) => "toast-1");
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastDismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(
    (message?: unknown, options?: unknown) => toastFn(message, options),
    {
      success: (m: string) => {
        toastSuccess(m);
      },
      error: (m: string) => {
        toastError(m);
      },
      dismiss: (id: unknown) => {
        toastDismiss(id);
      },
    },
  ),
}));

const mockedDelete = vi.mocked(deleteRecipeAction);
const mockedRestore = vi.mocked(restoreRecipeAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderButton() {
  return render(
    <DeleteRecipeButton id="r1" slug="nanas-pie" title="Nana's pie" />,
  );
}

describe("DeleteRecipeButton (#427)", () => {
  it("does nothing when the confirm is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderButton();

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(mockedDelete).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("soft-deletes and offers an undo toast on confirm", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedDelete.mockResolvedValue(undefined);
    renderButton();

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith("r1"));
    // The undo affordance is offered optimistically.
    expect(toastFn).toHaveBeenCalledTimes(1);
    const opts = toastFn.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void };
    };
    expect(opts.action.label).toBe("Undo");
  });

  it("restores the recipe and navigates back when Undo is invoked", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedDelete.mockResolvedValue(undefined);
    mockedRestore.mockResolvedValue(true);
    renderButton();

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    const opts = toastFn.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void };
    };
    opts.action.onClick();

    await waitFor(() => expect(mockedRestore).toHaveBeenCalledWith("r1"));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/recipes/nanas-pie"),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("surfaces an error and dismisses the toast when delete fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedDelete.mockRejectedValue(new Error("boom"));
    renderButton();

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastDismiss).toHaveBeenCalledWith("toast-1");
  });
});
