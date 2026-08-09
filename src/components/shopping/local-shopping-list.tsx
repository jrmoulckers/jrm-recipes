"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  displayLocalShoppingListName,
  useShoppingStore,
} from "~/lib/shopping-store";
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
  type PackagePreferenceDraft,
  type PackagePreferenceResult,
  type ShoppingViewItem,
} from "./shopping-list-view";
import type { ShoppingHistoryEntry } from "./shopping-history";

/** DB-off shopping list, backed by the persisted zustand store. */
export function LocalShoppingList({
  selectedListId,
}: {
  selectedListId?: string;
}) {
  const router = useRouter();
  const lists = useShoppingStore((s) => s.lists);
  const defaultListId = useShoppingStore((s) => s.defaultListId);
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
  const saveIngredientPackage = useShoppingStore(
    (s) => s.saveIngredientPackage,
  );
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
  const generatedListName = t("lists.generatedName");
  const displayListName = (list: {
    id: string;
    name: string;
    generatedName?: boolean;
  }) => displayLocalShoppingListName(list, generatedListName);

  // The store hydrates from localStorage on the client only. Wait for mount so
  // the first render matches the server (empty) and avoids a hydration warning.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const activeLists = lists.filter((list) => !list.archived);
  const urlList = activeLists.find((list) => list.id === selectedListId);
  const fallbackList =
    activeLists.find((list) => list.id === defaultListId) ?? activeLists[0];
  const routedList = urlList ?? fallbackList;

  React.useEffect(() => {
    if (!hydrated || !routedList) return;
    if (useShoppingStore.getState().currentListId !== routedList.id) {
      setCurrentList(routedList.id);
    }
    if (selectedListId !== routedList.id) {
      router.replace(`/shopping?list=${encodeURIComponent(routedList.id)}`, {
        scroll: false,
      });
    }
  }, [hydrated, routedList, router, selectedListId, setCurrentList]);

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

  const current = routedList ?? fallbackList;
  if (!current) return null;
  const currentList = current;

  const listOptions = activeLists.map((list) => ({
    id: list.id,
    name: displayListName(list),
    storeName: list.storeName,
    isDefault: list.isDefault,
  }));
  const summaries: ShoppingListSummary[] = lists.map((list) => ({
    id: list.id,
    name: displayListName(list),
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
      purchaseQuantity: i.purchaseQuantity,
      purchaseUnit: i.purchaseUnit,
      packageCount: i.packageCount,
      packageAmount: route?.packageAmount ?? null,
      packageUnit: route?.packageUnit ?? null,
      packageLabel: route?.packageLabel ?? null,
      note: i.note,
      category: i.category,
      optional: i.optional,
      checked: i.checked,
      routePreferredListId: route?.preferredListId ?? null,
      routeAlternativeListIds:
        route?.alternativeListIds.filter((id) =>
          activeLists.some((list) => list.id === id),
        ) ?? [],
      packageRoundBehavior: route?.packageRoundBehavior ?? "inherit",
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
    navigateToList(createList(name, storeName));
    toast.success(t("lists.toasts.created", { name }));
  }

  function navigateToList(listId: string) {
    setCurrentList(listId);
    router.push(`/shopping?list=${encodeURIComponent(listId)}`, {
      scroll: false,
    });
  }

  function onRename(listId: string, name: string, storeName: string | null) {
    renameList(listId, name, storeName);
    toast.success(t("lists.toasts.renamed", { name }));
  }

  function onMakeDefault(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    makeDefault(listId);
    toast.success(
      t("lists.toasts.madeDefault", { name: displayListName(list) }),
    );
  }

  function onRestore(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    restoreList(listId);
    toast.success(t("lists.toasts.restored", { name: displayListName(list) }));
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
    moveItem(
      currentList.id,
      itemId,
      targetListId,
      rememberRoute,
      alternativeListIds,
    );
    toast.success(
      t(rememberRoute ? "routing.toasts.routeSaved" : "routing.toasts.moved", {
        item: item.item,
        list: target.storeName ?? displayListName(target),
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
        list: target.storeName ?? displayListName(target),
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

  async function onSavePackage(
    itemId: string,
    draft: PackagePreferenceDraft,
  ): Promise<PackagePreferenceResult> {
    saveIngredientPackage({ itemId, ...draft });
    toast.success(t("package.saved"));
    return { ok: true };
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
      title: t("lists.confirm.archive.title", {
        name: displayListName(list),
      }),
      description: t("lists.confirm.archive.description"),
      confirmLabel: t("lists.archive"),
    });
    if (!ok) return false;
    archiveList(listId);
    toast.success(t("lists.toasts.archived", { name: displayListName(list) }));
    return true;
  }

  async function onDelete(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return false;
    const ok = await confirm({
      title: t("lists.confirm.delete.title", { name: displayListName(list) }),
      description: t("lists.confirm.delete.description"),
      confirmLabel: t("lists.delete"),
    });
    if (!ok) return false;
    deleteList(listId);
    toast.success(t("lists.toasts.deleted", { name: displayListName(list) }));
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <ShoppingListNavigation
        lists={summaries}
        selectedListId={currentList.id}
        onSelect={navigateToList}
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
        onToggle={(itemId, checked) =>
          setChecked(currentList.id, itemId, checked)
        }
        onRemove={(itemId) => remove(currentList.id, itemId)}
        onSetCategory={(itemId, category) =>
          setCategory(currentList.id, itemId, category)
        }
        onMove={onMove}
        onBulkMove={onBulkMove}
        onClearChecked={onRemoveCompleted}
        onUncheckAll={onUncheckAll}
        onSavePackage={onSavePackage}
        onClearAll={onClearAll}
        historyEntries={historyEntries}
        onRestoreHistory={onRestoreHistory}
      />
    </div>
  );
}
