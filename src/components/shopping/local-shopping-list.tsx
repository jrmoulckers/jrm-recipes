"use client";

import * as React from "react";
import { toast } from "sonner";

import { useShoppingStore } from "~/lib/shopping-store";
import { Skeleton } from "~/components/ui/skeleton";
import {
  ShoppingListView,
  type ManualEntryDraft,
  type ShoppingViewItem,
} from "./shopping-list-view";

/** DB-off shopping list, backed by the persisted zustand store. */
export function LocalShoppingList() {
  const items = useShoppingStore((s) => s.items);
  const addManual = useShoppingStore((s) => s.addManual);
  const setChecked = useShoppingStore((s) => s.setChecked);
  const remove = useShoppingStore((s) => s.remove);
  const clearChecked = useShoppingStore((s) => s.clearChecked);
  const clearAll = useShoppingStore((s) => s.clearAll);

  // The store hydrates from localStorage on the client only; wait for mount so
  // the first render matches the server (empty) and avoids a hydration warning.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const viewItems: ShoppingViewItem[] = items.map((i) => ({
    id: i.id,
    item: i.item,
    quantity: i.quantity,
    quantityMax: i.quantityMax,
    unit: i.unit,
    note: i.note,
    category: i.category,
    checked: i.checked,
  }));

  function onAddManual(entry: ManualEntryDraft) {
    addManual(entry);
  }

  function onClearAll() {
    if (items.length === 0) return;
    if (window.confirm("Clear the whole shopping list?")) {
      clearAll();
      toast.success("Shopping list cleared");
    }
  }

  return (
    <ShoppingListView
      items={viewItems}
      storageNote="saved on this device"
      onAddManual={onAddManual}
      onToggle={setChecked}
      onRemove={remove}
      onClearChecked={clearChecked}
      onClearAll={onClearAll}
    />
  );
}
