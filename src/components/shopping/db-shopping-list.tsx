'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useActiveMemberStore } from '~/lib/active-member-store';
import { type ActiveMemberOption } from '~/lib/dietary-match';
import { useFriendlyError } from '~/lib/error-copy';
import { type ShoppingCategory } from '~/lib/shopping-list';
import {
  addManualItemAction,
  archiveShoppingListAction,
  bulkMoveShoppingItemsAction,
  clearCheckedItemsAction,
  clearShoppingListAction,
  createShoppingListAction,
  deleteShoppingListAction,
  deleteShoppingStoreAction,
  makeShoppingListDefaultAction,
  moveShoppingItemAction,
  removeShoppingItemAction,
  renameShoppingListAction,
  renameShoppingStoreAction,
  restoreShoppingListAction,
  restoreShoppingListPointAction,
  restoreShoppingListPointsAction,
  saveIngredientPackageAction,
  setItemCategoryAction,
  setItemCheckedAction,
  uncheckAllShoppingItemsAction,
  type ActionResult,
} from '~/server/shopping/actions';
import { useConfirm } from '~/components/ui/confirm-dialog';
import {
  ShoppingListNavigation,
  type ShoppingListSummary,
  type ShoppingStoreSummary,
  type StoreSelection,
} from './shopping-list-navigation';
import {
  ShoppingListView,
  type ManualEntryDraft,
  type PackagePreferenceDraft,
  type PackagePreferenceResult,
  type ShoppingViewItem,
} from './shopping-list-view';
import type { ShoppingHistoryEntry } from './shopping-history';

type ServerActionResult = ActionResult | ({ ok: true } & Record<string, unknown>);

/** DB-backed shopping workspace with optimistic item updates and URL-backed list selection. */
export function DbShoppingList({
  items,
  lists,
  stores,
  selectedListId,
  defaultListId,
  historyEntries,
  members = [],
}: {
  items: ShoppingViewItem[];
  lists: ShoppingListSummary[];
  stores: ShoppingStoreSummary[];
  selectedListId: string;
  defaultListId: string;
  historyEntries: ShoppingHistoryEntry[];
  /** Family profiles, to warn on the active member's allergens (#432). */
  members?: ActiveMemberOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useState(items);
  const confirm = useConfirm();
  const t = useTranslations('shopping');
  const friendlyError = useFriendlyError();
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const avoidAllergens = members.find((member) => member.id === activeMemberId)?.allergens ?? [];

  React.useEffect(() => setOptimistic(items), [items]);

  const activeLists = lists.filter((list) => !list.archived);
  const storeNamesById = new Map(stores.map((store) => [store.id, store.name] as const));
  const listOptions = activeLists.map((list) => ({
    id: list.id,
    name: list.name,
    storeNames: list.storeIds
      .map((storeId) => storeNamesById.get(storeId))
      .filter((name): name is string => name != null),
    isDefault: list.id === defaultListId,
  }));

  function navigateToList(listId: string) {
    router.push(`/shopping?list=${encodeURIComponent(listId)}`);
  }

  function run<TResult extends ServerActionResult>(
    action: () => Promise<TResult>,
    onSuccess?: (result: Extract<TResult, { ok: true }>) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(friendlyError(result.error));
        router.refresh();
        return;
      }
      onSuccess?.(result as Extract<TResult, { ok: true }>);
      router.refresh();
    });
  }

  function onToggle(id: string, checked: boolean) {
    setOptimistic((previous) =>
      previous.map((item) => (item.id === id ? { ...item, checked } : item)),
    );
    run(() => setItemCheckedAction(id, checked));
  }

  function onRemove(id: string) {
    setOptimistic((previous) => previous.filter((item) => item.id !== id));
    run(() => removeShoppingItemAction(id));
  }

  function onSetCategory(id: string, category: ShoppingCategory) {
    setOptimistic((previous) =>
      previous.map((item) => (item.id === id ? { ...item, category } : item)),
    );
    run(() => setItemCategoryAction(id, category));
  }

  function onAddManual(entry: ManualEntryDraft) {
    run(() =>
      addManualItemAction({
        listId: selectedListId,
        item: entry.item,
        quantity: entry.quantity ?? undefined,
        unit: entry.unit ?? undefined,
      }),
    );
  }

  function onCreate(name: string, selection: StoreSelection) {
    run(
      () =>
        createShoppingListAction({
          name,
          storeIds: selection.storeIds,
          newStoreNames: selection.newStoreNames,
        }),
      (result) => {
        toast.success(t('lists.toasts.created', { name }));
        navigateToList(result.listId);
      },
    );
  }

  function onRename(listId: string, name: string, selection: StoreSelection) {
    run(
      () =>
        renameShoppingListAction({
          listId,
          name,
          storeIds: selection.storeIds,
          newStoreNames: selection.newStoreNames,
        }),
      () => toast.success(t('lists.toasts.renamed', { name })),
    );
  }

  function onRenameStore(storeId: string, name: string) {
    run(
      () => renameShoppingStoreAction({ storeId, name }),
      () => toast.success(t('lists.stores.toasts.renamed', { name })),
    );
  }

  async function onDeleteStore(storeId: string) {
    const store = stores.find((candidate) => candidate.id === storeId);
    if (!store) return false;
    const accepted = await confirm({
      title: t('lists.stores.confirm.delete.title', { name: store.name }),
      description: t('lists.stores.confirm.delete.description'),
      confirmLabel: t('lists.stores.delete'),
    });
    if (!accepted) return false;
    run(
      () => deleteShoppingStoreAction({ storeId }),
      () => toast.success(t('lists.stores.toasts.deleted', { name: store.name })),
    );
    return true;
  }

  function onMakeDefault(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    run(
      () => makeShoppingListDefaultAction({ listId }),
      () => toast.success(t('lists.toasts.madeDefault', { name: list.name })),
    );
  }

  async function onArchive(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return false;
    const accepted = await confirm({
      title: t('lists.confirm.archive.title', { name: list.name }),
      description: t('lists.confirm.archive.description'),
      confirmLabel: t('lists.archive'),
    });
    if (!accepted) return false;
    run(
      () => archiveShoppingListAction({ listId }),
      (result) => {
        toast.success(t('lists.toasts.archived', { name: list.name }));
        if (listId === selectedListId) {
          navigateToList(result.fallbackListId);
        }
      },
    );
    return true;
  }

  function onRestore(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    run(
      () => restoreShoppingListAction({ listId }),
      () => toast.success(t('lists.toasts.restored', { name: list.name })),
    );
  }

  async function onDelete(listId: string) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return false;
    const accepted = await confirm({
      title: t('lists.confirm.delete.title', { name: list.name }),
      description: t('lists.confirm.delete.description'),
      confirmLabel: t('lists.delete'),
    });
    if (!accepted) return false;
    run(
      () => deleteShoppingListAction({ listId }),
      (result) => {
        toast.success(t('lists.toasts.deleted', { name: list.name }));
        if (listId === selectedListId) {
          navigateToList(result.fallbackListId);
        }
      },
    );
    return true;
  }

  function onMove(
    itemId: string,
    targetListId: string,
    rememberRoute: boolean,
    alternativeListIds: string[],
  ) {
    const item = optimistic.find((candidate) => candidate.id === itemId);
    const target = lists.find((candidate) => candidate.id === targetListId);
    if (!item || !target) return;
    setOptimistic((previous) => previous.filter((candidate) => candidate.id !== itemId));
    run(
      () =>
        moveShoppingItemAction({
          itemId,
          targetListId,
          rememberRoute,
          alternativeListIds,
        }),
      () =>
        toast.success(
          t(rememberRoute ? 'routing.toasts.routeSaved' : 'routing.toasts.moved', {
            item: item.item,
            list: target.name,
          }),
        ),
    );
  }

  function onBulkMove(itemIds: string[], targetListId: string) {
    const target = lists.find((candidate) => candidate.id === targetListId);
    if (!target) return;
    const previous = optimistic;
    setOptimistic((items) => items.filter((item) => !itemIds.includes(item.id)));
    run(
      () => bulkMoveShoppingItemsAction({ itemIds, targetListId }),
      (result) => {
        toast.success(
          t('routing.bulk.toasts.moved', {
            count: itemIds.length,
            list: target.name,
          }),
          result.undoToken
            ? {
                duration: Infinity,
                action: {
                  label: t('history.undo'),
                  onClick: () => {
                    setOptimistic(previous);
                    run(
                      () => restoreShoppingListPointsAction(result.undoToken!),
                      () => toast.success(t('history.toasts.undoComplete')),
                    );
                  },
                },
              }
            : undefined,
        );
      },
    );
  }

  function onRestoreHistory(entry: ShoppingHistoryEntry) {
    const previous = optimistic;
    setOptimistic(entry.items);
    const references = entry.restorePoints ?? [
      { listId: selectedListId, restorePointId: entry.id },
    ];
    if (references.length > 1) {
      run(
        () =>
          restoreShoppingListPointsAction({
            restorePoints: references,
          }),
        (result) => {
          toast.success(t('history.toasts.restored'), {
            duration: Infinity,
            action: {
              label: t('history.undo'),
              onClick: () => {
                setOptimistic(previous);
                run(
                  () => restoreShoppingListPointsAction(result.undoToken),
                  () => toast.success(t('history.toasts.undoComplete')),
                );
              },
            },
          });
        },
      );
      return;
    }
    run(
      () =>
        restoreShoppingListPointAction({
          listId: selectedListId,
          restorePointId: references[0]!.restorePointId,
        }),
      (result) => {
        toast.success(t('history.toasts.restored'), {
          duration: Infinity,
          action: {
            label: t('history.undo'),
            onClick: () => {
              setOptimistic(previous);
              run(
                () =>
                  restoreShoppingListPointAction({
                    listId: selectedListId,
                    restorePointId: result.restorePointId,
                  }),
                () => toast.success(t('history.toasts.undoComplete')),
              );
            },
          },
        });
      },
    );
  }

  async function onSavePackage(
    itemId: string,
    draft: PackagePreferenceDraft,
  ): Promise<PackagePreferenceResult> {
    const result = await saveIngredientPackageAction({
      itemId,
      ...draft,
    });
    if (!result.ok) {
      return { ok: false, error: friendlyError(result.error) };
    }
    toast.success(t('package.saved'));
    router.refresh();
    return { ok: true };
  }

  function onClearChecked() {
    const previous = optimistic;
    setOptimistic((previous) => previous.filter((item) => !item.checked));
    run(
      () => clearCheckedItemsAction({ listId: selectedListId }),
      (result) =>
        toast.success(t('toasts.removedCompleted'), {
          duration: Infinity,
          action: {
            label: t('history.undo'),
            onClick: () => {
              setOptimistic(previous);
              run(
                () =>
                  restoreShoppingListPointAction({
                    listId: selectedListId,
                    restorePointId: result.restorePointId,
                  }),
                () => toast.success(t('history.toasts.undoComplete')),
              );
            },
          },
        }),
    );
  }

  function onUncheckAll() {
    setOptimistic((previous) => previous.map((item) => ({ ...item, checked: false })));
    run(
      () => uncheckAllShoppingItemsAction({ listId: selectedListId }),
      () => toast.success(t('toasts.uncheckedAll')),
    );
  }

  async function onClearAll() {
    if (optimistic.length === 0) return;
    const accepted = await confirm({
      title: t('confirm.clearAllSynced.title'),
      description: t('confirm.clearAllSynced.description'),
      confirmLabel: t('confirm.clearAll.confirmLabel'),
    });
    if (!accepted) return;
    const previous = optimistic;
    setOptimistic([]);
    run(
      () => clearShoppingListAction({ listId: selectedListId }),
      (result) =>
        toast.success(t('toasts.cleared'), {
          duration: Infinity,
          action: {
            label: t('history.undo'),
            onClick: () => {
              setOptimistic(previous);
              run(
                () =>
                  restoreShoppingListPointAction({
                    listId: selectedListId,
                    restorePointId: result.restorePointId,
                  }),
                () => toast.success(t('history.toasts.undoComplete')),
              );
            },
          },
        }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ShoppingListNavigation
        lists={lists}
        stores={stores}
        selectedListId={selectedListId}
        disabled={pending}
        onSelect={navigateToList}
        onCreate={onCreate}
        onRename={onRename}
        onRenameStore={onRenameStore}
        onDeleteStore={onDeleteStore}
        onMakeDefault={onMakeDefault}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
      />
      <ShoppingListView
        items={optimistic}
        storageNote={t('storage.synced')}
        avoidAllergens={avoidAllergens}
        disabled={pending}
        listOptions={listOptions}
        currentListId={selectedListId}
        onAddManual={onAddManual}
        onToggle={onToggle}
        onRemove={onRemove}
        onSetCategory={onSetCategory}
        onMove={onMove}
        onBulkMove={onBulkMove}
        onSavePackage={onSavePackage}
        onClearChecked={onClearChecked}
        onUncheckAll={onUncheckAll}
        onClearAll={onClearAll}
        historyEntries={historyEntries}
        onRestoreHistory={onRestoreHistory}
      />
    </div>
  );
}
