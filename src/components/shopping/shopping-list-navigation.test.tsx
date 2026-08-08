import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";
import {
  ShoppingListNavigation,
  type ShoppingListSummary,
} from "./shopping-list-navigation";

const lists: ShoppingListSummary[] = [
  {
    id: "qfc",
    name: "Weekly groceries",
    storeName: "QFC",
    isDefault: true,
    archived: false,
    itemCount: 2,
  },
  {
    id: "costco",
    name: "Bulk run",
    storeName: "Costco",
    isDefault: false,
    archived: false,
    itemCount: 0,
  },
  {
    id: "old",
    name: "Old market",
    storeName: null,
    isDefault: false,
    archived: true,
    itemCount: 1,
  },
];

function renderNavigation(selectedListId = "qfc") {
  const actions = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onMakeDefault: vi.fn(),
    onArchive: vi.fn(),
    onRestore: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <ShoppingListNavigation
      lists={lists}
      selectedListId={selectedListId}
      {...actions}
    />,
    { wrapper: IntlWrapper },
  );
  return actions;
}

afterEach(cleanup);

describe("ShoppingListNavigation", () => {
  it("changes the viewed list without changing the default", () => {
    const actions = renderNavigation();
    fireEvent.change(screen.getByLabelText("Current list"), {
      target: { value: "costco" },
    });

    expect(actions.onSelect).toHaveBeenCalledWith("costco");
    expect(actions.onMakeDefault).not.toHaveBeenCalled();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("exposes an explicit make-default action for a non-default list", () => {
    const actions = renderNavigation("costco");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Make default",
      }),
    );

    expect(actions.onMakeDefault).toHaveBeenCalledWith("costco");
  });

  it("creates a named store list with labeled fields", () => {
    const actions = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("List name"), {
      target: { value: "Farmers market" },
    });
    fireEvent.change(within(dialog).getByLabelText("Store (optional)"), {
      target: { value: "Saturday market" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create list" }),
    );

    expect(actions.onCreate).toHaveBeenCalledWith(
      "Farmers market",
      "Saturday market",
    );
  });

  it("keeps archived lists restorable from the manage dialog", () => {
    const actions = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Archived lists")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Restore Old market" }),
    );
    expect(actions.onRestore).toHaveBeenCalledWith("old");
  });
});
