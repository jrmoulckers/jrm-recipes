"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  categorize,
  mergeShoppingItems,
  toShoppingItems,
  type ShoppingCategory,
  type ShoppingItemInput,
  type ShoppingRecipeInput,
} from "~/lib/shopping-list";

/**
 * Offline shopping list. When no database is configured the app still needs a
 * fully working list, so we keep it in the browser (persisted to localStorage)
 * and reuse the exact same aggregation core as the server path.
 */

export type LocalShoppingItem = {
  id: string;
  item: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  note: string | null;
  category: ShoppingCategory;
  optional: boolean;
  checked: boolean;
  recipeId: string | null;
};

export type ManualEntry = {
  item: string;
  quantity?: number | null;
  quantityMax?: number | null;
  unit?: string | null;
  note?: string | null;
};

type ShoppingStore = {
  items: LocalShoppingItem[];
  addRecipe: (recipe: ShoppingRecipeInput) => void;
  addManual: (entry: ManualEntry) => void;
  setChecked: (id: string, checked: boolean) => void;
  setCategory: (id: string, category: ShoppingCategory) => void;
  remove: (id: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Re-consolidate the unchecked, un-noted items with a set of new inputs. */
function consolidate(
  existing: LocalShoppingItem[],
  incoming: ShoppingItemInput[],
): LocalShoppingItem[] {
  const preserved = existing.filter(
    (i) => i.checked || (i.note ?? "").length > 0,
  );
  const pool = existing.filter((i) => !i.checked && (i.note ?? "").length === 0);

  const poolInputs: ShoppingItemInput[] = pool.map((i) => ({
    item: i.item,
    quantity: i.quantity,
    quantityMax: i.quantityMax,
    unit: i.unit,
    optional: i.optional,
    recipeId: i.recipeId,
  }));

  const merged = mergeShoppingItems([...poolInputs, ...incoming]).map(
    (m): LocalShoppingItem => ({
      id: m.key,
      item: m.item,
      quantity: m.quantity,
      quantityMax: m.quantityMax,
      unit: m.unit,
      note: null,
      category: m.category,
      optional: m.optional,
      checked: false,
      recipeId: m.recipeIds[0] ?? null,
    }),
  );

  return [...preserved, ...merged];
}

export const useShoppingStore = create<ShoppingStore>()(
  persist(
    (set) => ({
      items: [],
      addRecipe: (recipe) =>
        set((state) => ({
          items: consolidate(state.items, toShoppingItems(recipe)),
        })),
      addManual: (entry) =>
        set((state) => ({
          items: [
            ...state.items,
            {
              id: uid(),
              item: entry.item.trim(),
              quantity: entry.quantity ?? null,
              quantityMax: entry.quantityMax ?? null,
              unit: entry.unit?.trim() ?? null,
              note: entry.note?.trim() ?? null,
              category: categorize(entry.item),
              optional: false,
              checked: false,
              recipeId: null,
            },
          ],
        })),
      setChecked: (id, checked) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, checked } : i,
          ),
        })),
      setCategory: (id, category) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, category } : i,
          ),
        })),
      remove: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clearChecked: () =>
        set((state) => ({ items: state.items.filter((i) => !i.checked) })),
      clearAll: () => set({ items: [] }),
    }),
    { name: "heirloom-shopping-list" },
  ),
);
