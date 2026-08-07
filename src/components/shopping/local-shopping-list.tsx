"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useShoppingStore } from "~/lib/shopping-store";
import { useConfirm } from "~/components/ui/confirm-dialog";
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
  const setCategory = useShoppingStore((s) => s.setCategory);
  const remove = useShoppingStore((s) => s.remove);
  const clearChecked = useShoppingStore((s) => s.clearChecked);
  const clearAll = useShoppingStore((s) => s.clearAll);
  const confirm = useConfirm();
  const t = useTranslations("shopping");

  // The store hydrates from localStorage on the client only. Wait for mount so
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
    optional: i.optional,
    checked: i.checked,
  }));

  function onAddManual(entry: ManualEntryDraft) {
    addManual(entry);
  }

  async function onClearAll() {
    if (items.length === 0) return;
    const ok = await confirm({
      title: t("confirm.clearAllLocal.title"),
      description: t("confirm.clearAllLocal.description"),
      confirmLabel: t("confirm.clearAll.confirmLabel"),
    });
    if (!ok) return;
    clearAll();
    toast.success(t("toasts.cleared"));
  }

  return (
    <ShoppingListView
      items={viewItems}
      storageNote={t("storage.local")}
      onAddManual={onAddManual}
      onToggle={setChecked}
      onRemove={remove}
      onSetCategory={setCategory}
      onClearChecked={clearChecked}
      onClearAll={onClearAll}
    />
  );
}
