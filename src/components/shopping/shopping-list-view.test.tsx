import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localeDirection } from "~/config/i18n";
import arMessages from "~/messages/ar.json";
import deMessages from "~/messages/de.json";
import enMessages from "~/messages/en.json";
import esMessages from "~/messages/es.json";
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

const localizedCases = [
  {
    locale: "en",
    messages: enMessages,
    input: "1.5",
    category: "Produce",
    renderedQuantity: "1.2 ml",
    direction: "ltr",
  },
  {
    locale: "es",
    messages: esMessages,
    input: "1,5",
    category: "Frutas y verduras",
    renderedQuantity: "1,2 ml",
    direction: "ltr",
  },
  {
    locale: "de",
    messages: deMessages,
    input: "1,5",
    category: "Obst und Gemüse",
    renderedQuantity: "1,2 ml",
    direction: "ltr",
  },
  {
    locale: "ar",
    messages: arMessages,
    input: "١٫٥",
    category: "المنتجات الطازجة",
    renderedQuantity: "١٫٢ ml",
    direction: "rtl",
  },
] as const;

describe("ShoppingListView localization", () => {
  it.each(localizedCases)(
    "localizes labels and preserves decimal values in $locale",
    ({ locale, messages, input, category, renderedQuantity, direction }) => {
      const onAddManual = vi.fn();
      render(
        <div
          data-testid="localized-shopping-root"
          dir={localeDirection(locale)}
        >
          <ShoppingListView
            items={[
              {
                ...item,
                category: "Produce",
                quantity: 1.2,
                unit: "ml",
              },
            ]}
            onAddManual={onAddManual}
            onToggle={vi.fn()}
            onRemove={vi.fn()}
            onSetCategory={vi.fn()}
            onUncheckAll={vi.fn()}
            onClearChecked={vi.fn()}
            onClearAll={vi.fn()}
          />
        </div>,
        {
          wrapper: ({ children }) => (
            <IntlWrapper locale={locale} messages={messages}>
              {children}
            </IntlWrapper>
          ),
        },
      );

      expect(screen.getByTestId("localized-shopping-root")).toHaveAttribute(
        "dir",
        direction,
      );
      expect(screen.getAllByText(category).length).toBeGreaterThanOrEqual(2);
      expect(
        screen.getAllByText((_, element) =>
          Boolean(element?.textContent?.includes(renderedQuantity)),
        ).length,
      ).toBeGreaterThan(0);

      const name = document.querySelector<HTMLInputElement>("#add-item")!;
      const quantity = document.querySelector<HTMLInputElement>("#add-qty")!;
      const unit = document.querySelector<HTMLInputElement>("#add-unit")!;
      fireEvent.change(name, { target: { value: "Apples" } });
      fireEvent.change(quantity, { target: { value: input } });
      fireEvent.change(unit, { target: { value: "ml" } });
      fireEvent.submit(name.closest("form")!);

      expect(onAddManual).toHaveBeenCalledWith({
        item: "Apples",
        quantity: 1.5,
        unit: "ml",
      });
    },
  );

  it("keeps invalid quantity text and surfaces a localized error", () => {
    const onAddManual = vi.fn();
    render(
      <ShoppingListView
        items={[]}
        onAddManual={onAddManual}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSetCategory={vi.fn()}
        onUncheckAll={vi.fn()}
        onClearChecked={vi.fn()}
        onClearAll={vi.fn()}
      />,
      {
        wrapper: ({ children }) => (
          <IntlWrapper locale="es" messages={esMessages}>
            {children}
          </IntlWrapper>
        ),
      },
    );

    const name = document.querySelector<HTMLInputElement>("#add-item")!;
    const quantity = document.querySelector<HTMLInputElement>("#add-qty")!;
    fireEvent.change(name, { target: { value: "Manzanas" } });
    fireEvent.change(quantity, { target: { value: "uno y medio" } });
    fireEvent.submit(name.closest("form")!);

    expect(quantity).toHaveValue("uno y medio");
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Introduce una cantidad mayor que cero",
    );
    expect(onAddManual).not.toHaveBeenCalled();
  });
});

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
            storeNames: ["QFC"],
            isDefault: true,
          },
          {
            id: "costco",
            name: "Bulk",
            storeNames: ["Costco"],
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
    expect(screen.getByText("Also at Bulk")).toBeInTheDocument();
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
            storeNames: ["QFC"],
            isDefault: true,
          },
          {
            id: "costco",
            name: "Bulk",
            storeNames: ["Costco"],
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

describe("ShoppingListView entity controls", () => {
  it("uses unique entity ids for controls and targets only the selected duplicate", () => {
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    render(
      <ShoppingListView
        items={[
          { ...item, id: "milk-checked", checked: true },
          { ...item, id: "milk-new", quantity: 2 },
        ]}
        onAddManual={vi.fn()}
        onToggle={onToggle}
        onRemove={onRemove}
        onSetCategory={vi.fn()}
        onUncheckAll={vi.fn()}
        onClearChecked={vi.fn()}
        onClearAll={vi.fn()}
      />,
      { wrapper: IntlWrapper },
    );

    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map(
      (element) => element.id,
    );
    expect(new Set(ids).size).toBe(ids.length);

    const newMilk = screen.getByRole("checkbox", { checked: false });
    fireEvent.click(newMilk);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("milk-new", true);

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove Milk",
    });
    fireEvent.click(removeButtons[0]!);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("milk-new");
  });
});

describe("ShoppingListView package guidance", () => {
  const listOptions = [
    {
      id: "qfc",
      name: "Weekly",
      storeNames: ["QFC"],
      isDefault: true,
    },
    {
      id: "costco",
      name: "Bulk",
      storeNames: ["Costco"],
      isDefault: false,
    },
  ];

  function renderView(
    viewItem: ShoppingViewItem,
    onSavePackage = vi.fn().mockResolvedValue({ ok: true }),
  ) {
    render(
      <ShoppingListView
        items={[viewItem]}
        listOptions={listOptions}
        currentListId="qfc"
        onAddManual={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSetCategory={vi.fn()}
        onSavePackage={onSavePackage}
        onUncheckAll={vi.fn()}
        onClearChecked={vi.fn()}
        onClearAll={vi.fn()}
      />,
      { wrapper: IntlWrapper },
    );
    return onSavePackage;
  }

  it("shows required ranges and purchase guidance without implying less", () => {
    renderView({
      ...item,
      quantity: 3,
      quantityMax: 4,
      unit: "cup",
      purchaseQuantity: 4.5,
      purchaseUnit: "cup",
      packageCount: 1,
      packageAmount: 4.5,
      packageUnit: "cup",
      packageLabel: "carton",
    });

    expect(screen.getByText("Need 3–4 cups")).toBeInTheDocument();
    expect(screen.getByText("Buy 1 carton (4½ cups)")).toBeInTheDocument();
  });

  it("preserves an exact non-package quantity when no conversion is valid", () => {
    renderView({
      ...item,
      quantity: 2,
      quantityMax: 3,
      unit: "bunch",
      packageAmount: 1,
      packageUnit: "case",
      packageLabel: "Local Farm",
      packageRoundBehavior: "disable",
    });

    expect(screen.getByText("Need 2–3 bunch")).toBeInTheDocument();
    expect(screen.getByText(/Local Farm/)).toBeInTheDocument();
    expect(screen.queryByText(/^Buy /)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit purchase settings for Milk",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Package amount")).toHaveValue("1");
    expect(within(dialog).getByLabelText("Package unit")).toHaveValue("case");
    expect(within(dialog).getByLabelText("Package rounding")).toHaveValue(
      "disable",
    );
  });

  it("edits package, rounding, label, and preferred store in one route form", async () => {
    const onSave = renderView(item);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit purchase settings for Milk",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(
      "Save the package sold at your preferred store. Leave the size blank to keep the exact required quantity.",
    );

    fireEvent.change(within(dialog).getByLabelText("Package amount"), {
      target: { value: "4,5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Package unit"), {
      target: { value: "cup" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Brand or package label (optional)"),
      { target: { value: "carton" } },
    );
    fireEvent.change(within(dialog).getByLabelText("Preferred store"), {
      target: { value: "costco" },
    });
    fireEvent.change(within(dialog).getByLabelText("Package rounding"), {
      target: { value: "enable" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Save purchase settings",
      }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("milk", {
        listId: "qfc",
        preferredListId: "costco",
        packageAmount: 4.5,
        packageUnit: "cup",
        packageLabel: "carton",
        packageRoundBehavior: "enable",
      }),
    );
  });

  it("surfaces invalid package amounts and keeps focusable form controls", () => {
    const onSave = renderView(item);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit purchase settings for Milk",
      }),
    );
    const dialog = screen.getByRole("dialog");
    const amount = within(dialog).getByLabelText("Package amount");
    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Save purchase settings",
      }),
    );

    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getByText("Enter a package amount greater than zero."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("includes localized purchase guidance when sharing", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderView({
      ...item,
      quantity: 3,
      unit: "cup",
      purchaseQuantity: 4,
      purchaseUnit: "cup",
      packageCount: 1,
      packageAmount: 4,
      packageUnit: "cup",
      packageLabel: "carton",
    });

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy text" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain("3 cups Milk");
    expect(writeText.mock.calls[0]?.[0]).toContain("Buy 1 carton (4 cups)");
  });
});
