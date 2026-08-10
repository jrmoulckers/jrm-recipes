import {
  cleanup,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ReactElement } from "react";

import { LeaveRecipeButton } from "./leave-recipe-button";
import { ConfirmProvider } from "~/components/ui/confirm-dialog";
import { leaveRecipeAsCreatorAction } from "~/server/recipes/creators-actions";
import { IntlWrapper } from "~/test/intl";

vi.mock("~/server/recipes/creators-actions", () => ({
  leaveRecipeAsCreatorAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRouter: () => ({ push, refresh: vi.fn() }) };
});

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

const mockedLeave = vi.mocked(leaveRecipeAsCreatorAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function render(ui: ReactElement) {
  return rtlRender(
    <IntlWrapper>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </IntlWrapper>,
  );
}

describe("LeaveRecipeButton (#668)", () => {
  it("does nothing when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    render(<LeaveRecipeButton recipeId="rec_1" />);

    await user.click(
      screen.getByRole("button", { name: /leave this recipe/i }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedLeave).not.toHaveBeenCalled();
  });

  it("leaves and navigates away, because the viewer just revoked their own access", async () => {
    // Re-rendering the recipe in place would either 404 or silently drop them
    // into a stranger's public view, so the library is the honest destination.
    const user = userEvent.setup();
    mockedLeave.mockResolvedValue({ ok: true });
    render(<LeaveRecipeButton recipeId="rec_1" />);

    await user.click(
      screen.getByRole("button", { name: /leave this recipe/i }),
    );
    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() =>
      expect(mockedLeave).toHaveBeenCalledWith({ recipeId: "rec_1" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes"));
  });

  it("stays put and reports the failure when leaving fails", async () => {
    const user = userEvent.setup();
    mockedLeave.mockResolvedValue({
      ok: false,
      error: "You own this recipe, so you can't step down from it.",
    });
    render(<LeaveRecipeButton recipeId="rec_1" />);

    await user.click(
      screen.getByRole("button", { name: /leave this recipe/i }),
    );
    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});
