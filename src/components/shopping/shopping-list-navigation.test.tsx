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
  type ShoppingStoreSummary,
} from "./shopping-list-navigation";

const stores: ShoppingStoreSummary[] = [
  { id: "s-qfc", name: "QFC" },
  { id: "s-costco", name: "Costco" },
  { id: "s-market", name: "Neighborhood market" },
];

const lists: ShoppingListSummary[] = [
  {
    id: "qfc",
    name: "Weekly groceries",
    storeIds: ["s-qfc", "s-costco"],
    isDefault: true,
    archived: false,
    itemCount: 2,
  },
  {
    id: "costco",
    name: "Bulk run",
    storeIds: [],
    isDefault: false,
    archived: false,
    itemCount: 0,
  },
  {
    id: "old",
    name: "Old market",
    storeIds: [],
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
    onRenameStore: vi.fn(),
    onDeleteStore: vi.fn(),
  };
  render(
    <ShoppingListNavigation
      lists={lists}
      stores={stores}
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

  it("creates a list spanning existing and newly typed stores", () => {
    const actions = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("List name"), {
      target: { value: "Farmers market" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Costco" }));
    fireEvent.change(within(dialog).getByLabelText("Add store"), {
      target: { value: "  Saturday market  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add store" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create list" }),
    );

    expect(actions.onCreate).toHaveBeenCalledWith("Farmers market", {
      storeIds: ["s-costco"],
      newStoreNames: ["Saturday market"],
    });
  });

  it("creates a store-free list when no store is chosen", () => {
    const actions = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("List name"), {
      target: { value: "Pantry restock" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create list" }),
    );

    expect(actions.onCreate).toHaveBeenCalledWith("Pantry restock", {
      storeIds: [],
      newStoreNames: [],
    });
  });

  it("titles the list by name and announces its stores separately", () => {
    renderNavigation();

    expect(
      within(screen.getByLabelText("Current list")).getByRole("option", {
        name: "Weekly groceries",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Stores: QFC and Costco")).toBeInTheDocument();
  });

  it("removes a store everywhere from the manage dialog", async () => {
    const actions = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete QFC",
      }),
    );

    expect(actions.onDeleteStore).toHaveBeenCalledWith("s-qfc");
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
