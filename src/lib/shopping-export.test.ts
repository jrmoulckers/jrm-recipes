import { describe, expect, it, vi } from "vitest";

import {
  buildShoppingListMailto,
  buildShoppingListPrintHtml,
  createShoppingExportDocument,
  detectShoppingExportCapabilities,
  groupShoppingExportItems,
  serializeShoppingExportText,
  shoppingExportFilename,
} from "./shopping-export";
import type { ShoppingCategory } from "./shopping-list";

const categoryLabels: Record<ShoppingCategory, string> = {
  Produce: "Frutas y verduras",
  Pantry: "Despensa",
  "Dairy & Eggs": "Lácteos y huevos",
  "Meat & Seafood": "Carne y marisco",
  Bakery: "Panadería",
  "Spices & Seasonings": "Especias y condimentos",
  Frozen: "Congelados",
  Beverages: "Bebidas",
  Other: "Otros",
};

function exportDocument(includeChecked = false) {
  return createShoppingExportDocument({
    listName: "Compra semanal",
    storeName: "Mercado Central",
    storeLabel: "Tienda",
    locale: "es",
    categoryLabels,
    includeChecked,
    items: [
      {
        item: "Tomates",
        quantity: 4,
        quantityMax: null,
        unit: null,
        note: "maduros",
        category: "Produce",
        checked: false,
      },
      {
        item: "Aceite",
        quantity: 1.2,
        quantityMax: null,
        unit: "ml",
        category: "Pantry",
        checked: false,
      },
      {
        item: "Leche",
        quantity: 1,
        quantityMax: null,
        unit: "l",
        category: "Dairy & Eggs",
        checked: true,
      },
    ],
  });
}

describe("shopping export adapters", () => {
  it("serializes the viewed list and store with localized groups", () => {
    const text = serializeShoppingExportText(exportDocument());

    expect(text).toContain("Compra semanal");
    expect(text).toContain("Tienda: Mercado Central");
    expect(text).toContain("Frutas y verduras:");
    expect(text).toContain("4 Tomates, maduros");
    expect(text).toContain("1,2 ml Aceite");
    expect(text).not.toContain("Leche");
  });

  it("uses one grouped document model for completed items", () => {
    const groups = groupShoppingExportItems(exportDocument(true));

    expect(groups.flatMap((group) => group.items)).toHaveLength(3);
    expect(serializeShoppingExportText(exportDocument(true))).toContain(
      "- [x] 1 l Leche",
    );
  });

  it("builds encoded mailto links and rejects links over the safe limit", () => {
    const safe = buildShoppingListMailto("Compra & cena", "Tomates\nPan", 500);
    expect(safe).toEqual({
      ok: true,
      href: "mailto:?subject=Compra%20%26%20cena&body=Tomates%0APan",
    });

    expect(buildShoppingListMailto("List", "x".repeat(500), 100)).toMatchObject(
      {
        ok: false,
        reason: "too-long",
      },
    );
  });

  it("generates safe filenames for localized and punctuation-heavy names", () => {
    expect(shoppingExportFilename({ listName: "Marché / Samedi" }, "txt")).toBe(
      "marche-samedi.txt",
    );
    expect(shoppingExportFilename({ listName: "قائمة" }, "png")).toBe(
      "shopping-list.png",
    );
  });

  it("emits a clean RTL print document and escapes list content", () => {
    const html = buildShoppingListPrintHtml(
      createShoppingExportDocument({
        ...exportDocument(true),
        listName: "<قائمة>",
        locale: "ar",
      }),
      { print: "طباعة", close: "إغلاق", completed: "مكتمل" },
    );

    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("&lt;قائمة&gt;");
    expect(html).not.toContain("<قائمة>");
    expect(html).toContain("@media print");
    expect(html).not.toContain("window.print()");
    expect(html).toContain("border: 1px solid #78716c");
  });

  it("uses Arabic digits in RTL print quantities", () => {
    const html = buildShoppingListPrintHtml(
      createShoppingExportDocument({
        ...exportDocument(),
        locale: "ar",
      }),
      { print: "طباعة", close: "إغلاق", completed: "مكتمل" },
    );

    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toMatch(/١٫٢ ml Aceite/);
  });
});

describe("shopping export capabilities", () => {
  it("detects the full browser export surface", () => {
    const fn = vi.fn();
    expect(
      detectShoppingExportCapabilities({
        clipboardWrite: fn,
        createElement: fn,
        createObjectURL: fn,
        revokeObjectURL: fn,
        canvasToBlob: fn,
        nativeShare: fn,
        openWindow: fn,
      }),
    ).toEqual({
      clipboard: true,
      fileDownload: true,
      imageDownload: true,
      nativeShare: true,
      printView: true,
    });
  });

  it("does not advertise native or image sharing without their APIs", () => {
    expect(
      detectShoppingExportCapabilities({
        createElement: vi.fn(),
        createObjectURL: vi.fn(),
        revokeObjectURL: vi.fn(),
      }),
    ).toEqual({
      clipboard: false,
      fileDownload: true,
      imageDownload: false,
      nativeShare: false,
      printView: false,
    });
  });
});
