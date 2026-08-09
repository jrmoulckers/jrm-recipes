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
});
