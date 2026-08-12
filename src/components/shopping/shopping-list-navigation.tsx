'use client';

import * as React from 'react';
import { Archive, Check, Plus, Settings2, Star, Store, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { NativeSelect } from '~/components/ui/native-select';
import { planStoreDisplay, type StoreSummary } from '~/lib/shopping-stores';
import { useDialogInitialFocus } from '~/lib/use-initial-focus';

export type ShoppingListSummary = {
  id: string;
  name: string;
  /** Ordered store ids; empty when the list isn't tied to any store. */
  storeIds: string[];
  isDefault: boolean;
  archived: boolean;
  itemCount: number;
};

export type ShoppingStoreSummary = StoreSummary;

export type StoreSelection = {
  /** Existing library stores to link, in display order. */
  storeIds: string[];
  /** Stores typed inline; resolved against the library before linking. */
  newStoreNames: string[];
};

const EMPTY_SELECTION: StoreSelection = { storeIds: [], newStoreNames: [] };

export function ShoppingListNavigation({
  lists,
  stores = [],
  selectedListId,
  disabled = false,
  onSelect,
  onCreate,
  onRename,
  onMakeDefault,
  onArchive,
  onRestore,
  onDelete,
  onRenameStore,
  onDeleteStore,
}: {
  lists: ShoppingListSummary[];
  stores?: ShoppingStoreSummary[];
  selectedListId: string;
  disabled?: boolean;
  onSelect: (listId: string) => void;
  onCreate: (name: string, stores: StoreSelection) => void;
  onRename: (listId: string, name: string, stores: StoreSelection) => void;
  onMakeDefault: (listId: string) => void;
  onArchive: (listId: string) => boolean | Promise<boolean>;
  onRestore: (listId: string) => void;
  onDelete: (listId: string) => boolean | Promise<boolean>;
  onRenameStore?: (storeId: string, name: string) => void;
  onDeleteStore?: (storeId: string) => boolean | Promise<boolean>;
}) {
  const t = useTranslations('shopping.lists');
  const active = lists.filter((list) => !list.archived);
  const archived = lists.filter((list) => list.archived);
  const selected = active.find((list) => list.id === selectedListId) ?? active[0];
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const selectedStores = (selected?.storeIds ?? [])
    .map((id) => storesById.get(id))
    .filter((store): store is ShoppingStoreSummary => store != null);

  return (
    <section
      aria-labelledby="shopping-lists-heading"
      className="rounded-2xl border border-border bg-surface/70 p-4 shadow-token-sm"
    >
      <h2 id="shopping-lists-heading" className="sr-only">
        {t('heading')}
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="shopping-list-select" className="mb-1.5 block text-sm font-medium">
            {t('current')}
          </label>
          <NativeSelect
            id="shopping-list-select"
            value={selected?.id ?? ''}
            disabled={disabled || active.length === 0}
            onChange={(event) => onSelect(event.target.value)}
          >
            {active.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected?.isDefault && (
            <Badge variant="muted" className="min-h-8 gap-1.5 px-3">
              <Star className="size-3.5" aria-hidden="true" />
              {t('defaultBadge')}
            </Badge>
          )}
          <CreateListDialog disabled={disabled} stores={stores} onCreate={onCreate} />
          {selected && (
            <ManageListDialog
              list={selected}
              archived={archived}
              stores={stores}
              disabled={disabled}
              onRename={onRename}
              onMakeDefault={onMakeDefault}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
              onRenameStore={onRenameStore}
              onDeleteStore={onDeleteStore}
            />
          )}
        </div>
      </div>
      <StoreChips stores={selectedStores} />
    </section>
  );
}

/**
 * The stores a list spans, shown in full when they fit and folded into a
 * concise count when they don't. The complete set is always announced.
 */
function StoreChips({ stores }: { stores: ShoppingStoreSummary[] }) {
  const t = useTranslations('shopping.lists');
  const format = useFormatter();
  if (stores.length === 0) return null;
  const { visible, overflowCount } = planStoreDisplay(stores);
  const allNames = format.list(stores.map((store) => store.name));

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
      <Store className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{t('storeCaption', { stores: allNames })}</span>
      {visible.map((store) => (
        <Badge key={store.id} variant="muted" aria-hidden="true">
          {store.name}
        </Badge>
      ))}
      {overflowCount > 0 && (
        <Badge variant="muted" aria-hidden="true" title={allNames}>
          {t('storeOverflow', { count: overflowCount })}
        </Badge>
      )}
    </p>
  );
}

function CreateListDialog({
  disabled,
  stores,
  onCreate,
}: {
  disabled: boolean;
  stores: ShoppingStoreSummary[];
  onCreate: (name: string, stores: StoreSelection) => void;
}) {
  const t = useTranslations('shopping.lists');
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [selection, setSelection] = React.useState<StoreSelection>(EMPTY_SELECTION);
  const { ref: nameRef, onOpenAutoFocus } = useDialogInitialFocus<HTMLInputElement>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), selection);
    setName('');
    setSelection(EMPTY_SELECTION);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <Plus aria-hidden="true" />
          {t('new')}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" onOpenAutoFocus={onOpenAutoFocus}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('create.title')}</DialogTitle>
            <DialogDescription>{t('create.description')}</DialogDescription>
          </DialogHeader>
          <ListFields
            prefix="create-list"
            name={name}
            stores={stores}
            selection={selection}
            onNameChange={setName}
            onSelectionChange={setSelection}
            nameRef={nameRef}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim()}>
              {t('create.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageListDialog({
  list,
  archived,
  stores,
  disabled,
  onRename,
  onMakeDefault,
  onArchive,
  onRestore,
  onDelete,
  onRenameStore,
  onDeleteStore,
}: {
  list: ShoppingListSummary;
  archived: ShoppingListSummary[];
  stores: ShoppingStoreSummary[];
  disabled: boolean;
  onRename: (listId: string, name: string, stores: StoreSelection) => void;
  onMakeDefault: (listId: string) => void;
  onArchive: (listId: string) => boolean | Promise<boolean>;
  onRestore: (listId: string) => void;
  onDelete: (listId: string) => boolean | Promise<boolean>;
  onRenameStore?: (storeId: string, name: string) => void;
  onDeleteStore?: (storeId: string) => boolean | Promise<boolean>;
}) {
  const t = useTranslations('shopping.lists');
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(list.name);
  const [selection, setSelection] = React.useState<StoreSelection>({
    storeIds: list.storeIds,
    newStoreNames: [],
  });
  const { ref: nameRef, onOpenAutoFocus } = useDialogInitialFocus<HTMLInputElement>();

  React.useEffect(() => {
    if (!open) return;
    setName(list.name);
    setSelection({ storeIds: list.storeIds, newStoreNames: [] });
  }, [list, open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onRename(list.id, name.trim(), selection);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled}>
          <Settings2 aria-hidden="true" />
          {t('manage')}
        </Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t('manageTitle', { name: list.name })}</DialogTitle>
            <DialogDescription>{t('manageDescription')}</DialogDescription>
          </DialogHeader>
          <ListFields
            prefix={`manage-list-${list.id}`}
            name={name}
            stores={stores}
            selection={selection}
            onNameChange={setName}
            onSelectionChange={setSelection}
            nameRef={nameRef}
          />
          {onRenameStore && onDeleteStore && stores.length > 0 && (
            <StoreLibrary
              stores={stores}
              onRenameStore={onRenameStore}
              onDeleteStore={onDeleteStore}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {!list.isDefault && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onMakeDefault(list.id);
                  setOpen(false);
                }}
              >
                <Star aria-hidden="true" />
                {t('makeDefault')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (await onArchive(list.id)) setOpen(false);
              }}
            >
              <Archive aria-hidden="true" />
              {t('archive')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                if (await onDelete(list.id)) setOpen(false);
              }}
            >
              <Trash2 aria-hidden="true" />
              {t('delete')}
            </Button>
          </div>
          {archived.length > 0 && (
            <section className="grid gap-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">{t('archived')}</h3>
              {archived.map((archivedList) => (
                <div
                  key={archivedList.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">{archivedList.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t('restoreNamed', {
                      name: archivedList.name,
                    })}
                    onClick={() => onRestore(archivedList.id)}
                  >
                    {t('restore')}
                  </Button>
                </div>
              ))}
            </section>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ListFields({
  prefix,
  name,
  stores,
  selection,
  onNameChange,
  onSelectionChange,
  nameRef,
}: {
  prefix: string;
  name: string;
  stores: ShoppingStoreSummary[];
  selection: StoreSelection;
  onNameChange: (value: string) => void;
  onSelectionChange: (value: StoreSelection) => void;
  /** Focus target for the enclosing dialog's `onOpenAutoFocus`. */
  nameRef?: React.Ref<HTMLInputElement>;
}) {
  const t = useTranslations('shopping.lists');
  const [draftStore, setDraftStore] = React.useState('');

  function toggleStore(storeId: string, checked: boolean) {
    onSelectionChange({
      ...selection,
      storeIds: checked
        ? [...selection.storeIds, storeId]
        : selection.storeIds.filter((id) => id !== storeId),
    });
  }

  function addDraftStore() {
    const value = draftStore.trim();
    if (!value) return;
    const existing = stores.find((store) => store.name.toLowerCase() === value.toLowerCase());
    if (existing) {
      if (!selection.storeIds.includes(existing.id)) {
        toggleStore(existing.id, true);
      }
    } else if (
      !selection.newStoreNames.some((pending) => pending.toLowerCase() === value.toLowerCase())
    ) {
      onSelectionChange({
        ...selection,
        newStoreNames: [...selection.newStoreNames, value],
      });
    }
    setDraftStore('');
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={`${prefix}-name`} className="text-sm font-medium">
          {t('fields.name')}
        </label>
        <Input
          id={`${prefix}-name`}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={120}
          ref={nameRef}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('fields.stores')}</legend>
        <p className="text-xs text-muted-foreground">{t('fields.storeHint')}</p>
        {stores.length > 0 && (
          <div className="grid gap-1">
            {stores.map((store) => (
              <label
                key={store.id}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selection.storeIds.includes(store.id)}
                  onCheckedChange={(value) => toggleStore(store.id, value === true)}
                />
                {store.name}
              </label>
            ))}
          </div>
        )}
        {selection.newStoreNames.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {selection.newStoreNames.map((pending) => (
              <li key={pending}>
                <Badge variant="muted" className="gap-1.5">
                  {pending}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t('fields.removeStore', { store: pending })}
                    onClick={() =>
                      onSelectionChange({
                        ...selection,
                        newStoreNames: selection.newStoreNames.filter(
                          (candidate) => candidate !== pending,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            id={`${prefix}-store`}
            value={draftStore}
            onChange={(event) => setDraftStore(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Adding a store must not submit the surrounding list form.
              event.preventDefault();
              addDraftStore();
            }}
            placeholder={t('fields.storePlaceholder')}
            aria-label={t('fields.addStore')}
            maxLength={120}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!draftStore.trim()}
            onClick={addDraftStore}
          >
            <Plus aria-hidden="true" />
            {t('fields.addStore')}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

/** Rename or remove stores without leaving the list they were opened from. */
function StoreLibrary({
  stores,
  onRenameStore,
  onDeleteStore,
}: {
  stores: ShoppingStoreSummary[];
  onRenameStore: (storeId: string, name: string) => void;
  onDeleteStore: (storeId: string) => boolean | Promise<boolean>;
}) {
  const t = useTranslations('shopping.lists');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  return (
    <section className="grid gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">{t('stores.heading')}</h3>
      <p className="text-xs text-muted-foreground">{t('stores.hint')}</p>
      {stores.map((store) => (
        <div
          key={store.id}
          className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
        >
          {editingId === store.id ? (
            <>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={t('stores.renameNamed', { store: store.name })}
                maxLength={120}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!draft.trim()}
                aria-label={t('stores.saveNamed', { store: store.name })}
                onClick={() => {
                  onRenameStore(store.id, draft.trim());
                  setEditingId(null);
                }}
              >
                <Check aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <span className="min-w-0 truncate text-sm">{store.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t('stores.renameNamed', { store: store.name })}
                  onClick={() => {
                    setEditingId(store.id);
                    setDraft(store.name);
                  }}
                >
                  <Settings2 aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t('stores.deleteNamed', { store: store.name })}
                  onClick={() => void onDeleteStore(store.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
