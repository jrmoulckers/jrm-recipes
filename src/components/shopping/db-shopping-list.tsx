"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  addManualItemAction,
  clearCheckedItemsAction,
  clearShoppingListAction,
  removeShoppingItemAction,
  setItemCheckedAction,
  type ActionResult,
} from "~/server/shopping/actions";
import { useActiveMemberStore } from "~/lib/active-member-store";
import { type ActiveMemberOption } from "~/lib/dietary-match";
import {
  ShoppingListView,
  type ManualEntryDraft,
  type ShoppingViewItem,
} from "./shopping-list-view";

/** DB-backed shopping list. Check-off / remove are optimistic; adds refresh. */
export function DbShoppingList({
  items,
  members = [],
}: {
  items: ShoppingViewItem[];
  /** Family profiles, to warn on the active member's allergens (#432). */
  members?: ActiveMemberOption[];
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useState(items);
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const avoidAllergens =
    members.find((m) => m.id === activeMemberId)?.allergens ?? [];

  // Re-sync whenever the server sends fresh data (after revalidate/refresh).
  React.useEffect(() => setOptimistic(items), [items]);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(friendlyError(result.error));
      router.refresh();
    });
  }

  function onToggle(id: string, checked: boolean) {
    setOptimistic((prev) =>
      prev.map((i) => (i.id === id ? { ...i, checked } : i)),
    );
    run(() => setItemCheckedAction(id, checked));
  }

  function onRemove(id: string) {
    setOptimistic((prev) => prev.filter((i) => i.id !== id));
    run(() => removeShoppingItemAction(id));
  }

  function onAddManual(entry: ManualEntryDraft) {
    run(() =>
      addManualItemAction({
        item: entry.item,
        quantity: entry.quantity ?? undefined,
        unit: entry.unit ?? undefined,
      }),
    );
  }

  function onClearChecked() {
    setOptimistic((prev) => prev.filter((i) => !i.checked));
    run(clearCheckedItemsAction);
  }

  function onClearAll() {
    if (optimistic.length === 0) return;
    if (!window.confirm("Clear the whole shopping list?")) return;
    setOptimistic([]);
    run(clearShoppingListAction);
  }

  return (
    <ShoppingListView
      items={optimistic}
      storageNote="synced to your account"
      avoidAllergens={avoidAllergens}
      onAddManual={onAddManual}
      onToggle={onToggle}
      onRemove={onRemove}
      onClearChecked={onClearChecked}
      onClearAll={onClearAll}
    />
  );
}
