import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
