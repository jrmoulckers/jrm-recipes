import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";
import { ShoppingListView, type ShoppingViewItem } from "./shopping-list-view";

const item: ShoppingViewItem = {
  id: "milk",
  item: "Milk",
  quantity: 1,
  quantityMax: null,
  unit: "gal",
  note: null,
  category: "Dairy & Eggs",
  checked: false,
  routePreferredListId: "qfc",
  routeAlternativeListIds: ["costco"],
};

afterEach(cleanup);

describe("ShoppingListView routing controls", () => {
  it("shows alternatives without duplicating an item and moves by keyboard-accessible controls", () => {
    const onMove = vi.fn();
    render(
      <ShoppingListView
        items={[item]}
        listOptions={[
          {
            id: "qfc",
            name: "Weekly",
            storeName: "QFC",
            isDefault: true,
          },
          {
            id: "costco",
            name: "Bulk",
            storeName: "Costco",
            isDefault: false,
          },
        ]}
        currentListId="qfc"
        onAddManual={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSetCategory={vi.fn()}
        onMove={onMove}
        onClearChecked={vi.fn()}
        onUncheckAll={vi.fn()}
        onClearAll={vi.fn()}
      />,
      { wrapper: IntlWrapper },
    );

    expect(screen.getAllByText("Milk")).toHaveLength(1);
    expect(screen.getByText("Also at Costco")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Move Milk to another list" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Preferred list"), {
      target: { value: "costco" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move item" }));

    expect(onMove).toHaveBeenCalledWith("milk", "costco", false, []);
  });

  it("offers separate non-destructive and destructive completion actions", () => {
    const onUncheckAll = vi.fn();
    const onClearChecked = vi.fn();
    render(
      <ShoppingListView
        items={[{ ...item, checked: true }]}
        currentListId="qfc"
        onAddManual={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSetCategory={vi.fn()}
        onUncheckAll={onUncheckAll}
        onClearChecked={onClearChecked}
        onClearAll={vi.fn()}
      />,
      { wrapper: IntlWrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: "Uncheck all" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove completed" }));

    expect(onUncheckAll).toHaveBeenCalledOnce();
    expect(onClearChecked).toHaveBeenCalledOnce();
  });

  it("previews and restores a recent list state", () => {
    const onRestoreHistory = vi.fn();
    render(
      <ShoppingListView
        items={[item]}
        currentListId="qfc"
        onAddManual={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSetCategory={vi.fn()}
        onUncheckAll={vi.fn()}
        onClearChecked={vi.fn()}
        onClearAll={vi.fn()}
        historyEntries={[
          {
            id: "point-1",
            operation: "clear-all",
            createdAt: "2026-08-08T12:00:00.000Z",
            items: [{ ...item, item: "Earlier milk" }],
          },
        ]}
        onRestoreHistory={onRestoreHistory}
      />,
      { wrapper: IntlWrapper },
    );

    fireEvent.click(screen.getByText("Recent changes"));
    fireEvent.click(screen.getByText("Cleared list"));
    expect(screen.getByText("Earlier milk")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Restore Cleared list from/,
      }),
    );

    expect(onRestoreHistory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "point-1" }),
    );
    expect(screen.getByText(/Up to 20 changes/)).toBeInTheDocument();
  });

  it("moves all remaining items through the reversible bulk action", () => {
    const onBulkMove = vi.fn();
    render(
      <ShoppingListView
        items={[item, { ...item, id: "eggs", item: "Eggs", checked: true }]}
        listOptions={[
          {
            id: "qfc",
            name: "Weekly",
            storeName: "QFC",
            isDefault: true,
          },
          {
            id: "costco",
            name: "Bulk",
            storeName: "Costco",
            isDefault: false,
          },
        ]}
        currentListId="qfc"
        onAddManual={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSetCategory={vi.fn()}
        onUncheckAll={vi.fn()}
        onClearChecked={vi.fn()}
        onClearAll={vi.fn()}
        onBulkMove={onBulkMove}
      />,
      { wrapper: IntlWrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: "Move remaining" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move 1 item" }),
    );

    expect(onBulkMove).toHaveBeenCalledWith(["milk"], "costco");
  });
});
