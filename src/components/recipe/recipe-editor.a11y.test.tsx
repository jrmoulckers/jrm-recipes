import { cleanup, render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("~/server/recipes/actions", () => ({
  createRecipeAction: vi.fn(),
  importRecipeFromUrlAction: vi.fn(),
  updateRecipeAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { RecipeEditor } from "./recipe-editor";
import type { ReactElement } from "react";
import { IntlWrapper } from "~/test/intl";

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

// The editor renders the Save action twice: the top action bar plus a sticky
// mobile Save/Cancel bar that keeps it in the thumb zone (issue #294). In a
// real browser only one is in the accessibility tree per breakpoint (the other
// is `display:none` via a responsive `hidden`/`md:hidden` class), but jsdom
// applies no CSS so both are present here — target the primary top-bar button.
function primarySaveButton() {
  return screen.getAllByRole("button", { name: /save recipe/i })[0]!;
}

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView; the summary links call it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("RecipeEditor label association (issue #123)", () => {
  it("associates every field label with its control (input and native select)", () => {
    render(<RecipeEditor mode="create" />);

    // getByLabelText only resolves when label[for] ↔ control id is wired.
    const title = screen.getByLabelText(/^Title/);
    expect(title.tagName).toBe("INPUT");

    const difficulty = screen.getByLabelText("Difficulty");
    expect(difficulty.tagName).toBe("SELECT");
  });

  it("moves focus to the control when its label is clicked", async () => {
    const user = userEvent.setup();
    render(<RecipeEditor mode="create" />);

    const title = screen.getByLabelText<HTMLInputElement>(/^Title/);
    const label = title.labels?.[0];
    expect(label).toBeTruthy();

    await user.click(label!);
    expect(title).toHaveFocus();
  });

  it("marks required fields with aria-required and leaves optional ones unset", () => {
    render(<RecipeEditor mode="create" />);

    expect(screen.getByLabelText(/^Title/)).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText(/^Description/)).not.toHaveAttribute(
      "aria-required",
    );
  });
});

describe("RecipeEditor error summary (issue #124)", () => {
  it("shows a focused alert summary linking to the invalid field on submit", async () => {
    const user = userEvent.setup();
    render(<RecipeEditor mode="create" />);

    // Submit with an empty title -> client validation error.
    await user.click(primarySaveButton());

    const alert = await screen.findByRole("alert");
    // Summary receives focus so keyboard/SR users land on it.
    expect(alert).toHaveFocus();

    const link = within(alert).getByRole("link", { name: "Title" });
    expect(link).toHaveAttribute("href", "#recipe-field-title");
  });

  it("ties the error message to the control via aria-invalid and aria-describedby", async () => {
    const user = userEvent.setup();
    render(<RecipeEditor mode="create" />);

    await user.click(primarySaveButton());
    await screen.findByRole("alert");

    const title = screen.getByLabelText(/^Title/);
    expect(title).toHaveAttribute("aria-invalid", "true");
    const describedBy = title.getAttribute("aria-describedby");
    expect(describedBy).toBe("recipe-field-title-error");

    // The referenced element actually holds the message text.
    const message = document.getElementById(describedBy!);
    expect(message).toHaveTextContent(/title/i);
  });

  it("moves focus to the offending control when a summary link is activated", async () => {
    const user = userEvent.setup();
    render(<RecipeEditor mode="create" />);

    await user.click(primarySaveButton());
    const alert = await screen.findByRole("alert");

    await user.click(within(alert).getByRole("link", { name: "Title" }));
    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
  });
});
