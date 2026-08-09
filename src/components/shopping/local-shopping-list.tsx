"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useShoppingStore } from "~/lib/shopping-store";
import { findIngredientRoute } from "~/lib/shopping-routing";
import { useConfirm } from "~/components/ui/confirm-dialog";
import { Skeleton } from "~/components/ui/skeleton";
import {
  ShoppingListNavigation,
  type ShoppingListSummary,
} from "./shopping-list-navigation";
import {
  ShoppingListView,
  type ManualEntryDraft,
  type ShoppingViewItem,
} from "./shopping-list-view";
import type { ShoppingHistoryEntry } from "./shopping-history";

/** DB-off shopping list, backed by the persisted zustand store. */
export function LocalShoppingList() {
  const lists = useShoppingStore((s) => s.lists);
  const currentListId = useShoppingStore((s) => s.currentListId);
  const routes = useShoppingStore((s) => s.routes);
  const restorePoints = useShoppingStore((s) => s.restorePoints);
  const addManual = useShoppingStore((s) => s.addManual);
  const createList = useShoppingStore((s) => s.createList);
  const renameList = useShoppingStore((s) => s.renameList);
  const setCurrentList = useShoppingStore((s) => s.setCurrentList);
  const makeDefault = useShoppingStore((s) => s.makeDefault);
  const archiveList = useShoppingStore((s) => s.archiveList);
  const restoreList = useShoppingStore((s) => s.restoreList);
  const deleteList = useShoppingStore((s) => s.deleteList);
  const moveItem = useShoppingStore((s) => s.moveItem);
  const bulkMoveItems = useShoppingStore((s) => s.bulkMoveItems);
  const setChecked = useShoppingStore((s) => s.setChecked);
  const setCategory = useShoppingStore((s) => s.setCategory);
  const remove = useShoppingStore((s) => s.remove);
  const removeCompleted = useShoppingStore((s) => s.removeCompleted);
  const uncheckAll = useShoppingStore((s) => s.uncheckAll);
  const clearAll = useShoppingStore((s) => s.clearAll);
  const restoreFromHistory = useShoppingStore((s) => s.restoreFromHistory);
  const restoreMultipleFromHistory = useShoppingStore(
    (s) => s.restoreMultipleFromHistory,
  );
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

  const current =
    lists.find((list) => list.id === currentListId && !list.archived) ??
    lists.find((list) => list.isDefault && !list.archived) ??
    lists.find((list) => !list.archived);
  if (!current) return null;
  const currentList = current;

  const activeLists = lists.filter((list) => !list.archived);
  const listOptions = activeLists.map((list) => ({
    id: list.id,
    name: list.name,
    storeName: list.storeName,
    isDefault: list.isDefault,
  }));
  const summaries: ShoppingListSummary[] = lists.map((list) => ({
    id: list.id,
    name: list.name,
    storeName: list.storeName,
    isDefault: list.isDefault,
    archived: list.archived,
    itemCount: list.items.length,
  }));
  const viewItems: ShoppingViewItem[] = currentList.items.map((i) => {
    const route = findIngredientRoute(i, routes);
    return {
      id: i.id,
      item: i.item,
      quantity: i.quantity,
      quantityMax: i.quantityMax,
      unit: i.unit,
      note: i.note,
      category: i.category,
      optional: i.optional,
      checked: i.checked,
      routePreferredListId: route?.preferredListId ?? null,
      routeAlternativeListIds:
        route?.alternativeListIds.filter((id) =>
          activeLists.some((list) => list.id === id),
        ) ?? [],
    };
  });
  const historyEntries = restorePoints
    .filter((point) => point.listId === currentList.id)
    .map((point) => ({
      ...point,
      restorePoints: point.operationGroupId
        ? restorePoints
            .filter(
              (candidate) =>
                candidate.operationGroupId === point.operationGroupId,
            )
            .map((candidate) => ({
              listId: candidate.listId,
              restorePointId: candidate.id,
            }))
        : [{ listId: point.listId, restorePointId: point.id }],
      items: point.items.map((item): ShoppingViewItem => ({
        id: item.id,
        item: item.item,
        quantity: item.quantity,
        quantityMax: item.quantityMax,
        unit: item.unit,
        note: item.note,
        category: item.category,
        optional: item.optional,
        checked: item.checked,
      })),
    }));

  function onAddManual(entry: ManualEntryDraft) {
    addManual(currentList.id, entry);
  }

  function onCreate(name: string, storeName: string | null) {
    createList(name, storeName);
    toast.success(t("lists.toasts.created", { name }));
  }

  function onRename(listId: string, name: string, storeName: string | null) {
    renameList(listId, name, storeName);
    toast.success(t("lists.toasts.renamed", { name }));
  }

  function onMakeDefault(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    makeDefault(listId);
    toast.success(t("lists.toasts.madeDefault", { name: list.name }));
  }

  function onRestore(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    restoreList(listId);
    toast.success(t("lists.toasts.restored", { name: list.name }));
  }

  function onMove(
    itemId: string,
    targetListId: string,
    rememberRoute: boolean,
    alternativeListIds: string[],
  ) {
    const item = currentList.items.find((candidate) => candidate.id === itemId);
    const target = lists.find((candidate) => candidate.id === targetListId);
    if (!item || !target) return;
    moveItem(itemId, targetListId, rememberRoute, alternativeListIds);
    toast.success(
      t(rememberRoute ? "routing.toasts.routeSaved" : "routing.toasts.moved", {
        item: item.item,
        list: target.storeName ?? target.name,
      }),
    );
  }

  function onBulkMove(itemIds: string[], targetListId: string) {
    const target = lists.find((list) => list.id === targetListId);
    const result = bulkMoveItems(currentList.id, itemIds, targetListId);
    if (!target || !result) return;
    toast.success(
      t("routing.bulk.toasts.moved", {
        count: itemIds.length,
        list: target.storeName ?? target.name,
      }),
      {
        duration: Infinity,
        action: {
          label: t("history.undo"),
          onClick: () => {
            restoreMultipleFromHistory([
              {
                listId: currentList.id,
                restorePointId: result.sourceRestorePointId,
              },
              {
                listId: targetListId,
                restorePointId: result.targetRestorePointId,
              },
            ]);
            toast.success(t("history.toasts.undoComplete"));
          },
        },
      },
    );
  }

  function restoreSingleHistoryPoint(restorePointId: string) {
    const undoPointId = restoreFromHistory(currentList.id, restorePointId);
    if (!undoPointId) return;
    toast.success(t("history.toasts.restored"), {
      duration: Infinity,
      action: {
        label: t("history.undo"),
        onClick: () => {
          restoreFromHistory(currentList.id, undoPointId);
          toast.success(t("history.toasts.undoComplete"));
        },
      },
    });
  }

  function onRestoreHistory(entry: ShoppingHistoryEntry) {
    const references = entry.restorePoints ?? [
      { listId: currentList.id, restorePointId: entry.id },
    ];
    if (references.length === 1) {
      restoreSingleHistoryPoint(references[0]!.restorePointId);
      return;
    }
    const undoPoints = restoreMultipleFromHistory(references);
    if (!undoPoints) return;
    toast.success(t("history.toasts.restored"), {
      duration: Infinity,
      action: {
        label: t("history.undo"),
        onClick: () => {
          restoreMultipleFromHistory(undoPoints);
          toast.success(t("history.toasts.undoComplete"));
        },
      },
    });
  }

  function onRemoveCompleted() {
    const restorePointId = removeCompleted(currentList.id);
    if (!restorePointId) return;
    toast.success(t("toasts.removedCompleted"), {
      duration: Infinity,
      action: {
        label: t("history.undo"),
        onClick: () => restoreSingleHistoryPoint(restorePointId),
      },
    });
  }

  function onUncheckAll() {
    uncheckAll(currentList.id);
    toast.success(t("toasts.uncheckedAll"));
  }

  async function onClearAll() {
    if (currentList.items.length === 0) return;
    const ok = await confirm({
      title: t("confirm.clearAllLocal.title"),
      description: t("confirm.clearAllLocal.description"),
      confirmLabel: t("confirm.clearAll.confirmLabel"),
    });
    if (!ok) return;
    const restorePointId = clearAll(currentList.id);
    if (!restorePointId) return;
    toast.success(t("toasts.cleared"), {
      duration: Infinity,
      action: {
        label: t("history.undo"),
        onClick: () => restoreSingleHistoryPoint(restorePointId),
      },
    });
  }

  async function onArchive(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return false;
    const ok = await confirm({
      title: t("lists.confirm.archive.title", { name: list.name }),
      description: t("lists.confirm.archive.description"),
      confirmLabel: t("lists.archive"),
    });
    if (!ok) return false;
    archiveList(listId);
    toast.success(t("lists.toasts.archived", { name: list.name }));
    return true;
  }

  async function onDelete(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return false;
    const ok = await confirm({
      title: t("lists.confirm.delete.title", { name: list.name }),
      description: t("lists.confirm.delete.description"),
      confirmLabel: t("lists.delete"),
    });
    if (!ok) return false;
    deleteList(listId);
    toast.success(t("lists.toasts.deleted", { name: list.name }));
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <ShoppingListNavigation
        lists={summaries}
        selectedListId={currentList.id}
        onSelect={setCurrentList}
        onCreate={onCreate}
        onRename={onRename}
        onMakeDefault={onMakeDefault}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
      />
      <ShoppingListView
        items={viewItems}
        storageNote={t("storage.local")}
        listOptions={listOptions}
        currentListId={currentList.id}
        onAddManual={onAddManual}
        onToggle={setChecked}
        onRemove={remove}
        onSetCategory={setCategory}
        onMove={onMove}
        onBulkMove={onBulkMove}
        onClearChecked={onRemoveCompleted}
        onUncheckAll={onUncheckAll}
        onClearAll={onClearAll}
        historyEntries={historyEntries}
        onRestoreHistory={onRestoreHistory}
      />
    </div>
  );
}
