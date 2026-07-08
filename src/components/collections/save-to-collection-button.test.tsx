import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/collections/actions", () => ({
  addRecipeToCollectionAction: vi.fn(),
  createCollectionAction: vi.fn(),
  removeRecipeFromCollectionAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import { SaveToCollectionButton } from "./save-to-collection-button";
import type { ReactElement } from "react";
import { IntlWrapper } from "~/test/intl";

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

afterEach(cleanup);

describe("SaveToCollectionButton toggle names (issue #122)", () => {
  it("names each toggle with the action and full collection name, keeping state", async () => {
    const user = userEvent.setup();
    render(
      <SaveToCollectionButton
        recipeId="r1"
        canSave
        collections={[
          { id: "c1", name: "Weeknight dinners", contains: false },
          { id: "c2", name: "Sunday favorites", contains: true },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save to collection/i }));

    // A non-member reads as "Add to …"; a member reads as "Remove from …".
    const add = screen.getByRole("button", {
      name: "Add to collection Weeknight dinners",
    });
    const remove = screen.getByRole("button", {
      name: "Remove from collection Sunday favorites",
    });

    // aria-pressed still reflects membership accurately.
    expect(add).toHaveAttribute("aria-pressed", "false");
    expect(remove).toHaveAttribute("aria-pressed", "true");
  });
});
