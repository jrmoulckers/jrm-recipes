"use client";

import * as React from "react";
import { Archive, Plus, Settings2, Star, Store, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { NativeSelect } from "~/components/ui/native-select";

export type ShoppingListSummary = {
  id: string;
  name: string;
  storeName: string | null;
  isDefault: boolean;
  archived: boolean;
  itemCount: number;
};

export function ShoppingListNavigation({
  lists,
  selectedListId,
  disabled = false,
  onSelect,
  onCreate,
  onRename,
  onMakeDefault,
  onArchive,
  onRestore,
  onDelete,
}: {
  lists: ShoppingListSummary[];
  selectedListId: string;
  disabled?: boolean;
  onSelect: (listId: string) => void;
  onCreate: (name: string, storeName: string | null) => void;
  onRename: (listId: string, name: string, storeName: string | null) => void;
  onMakeDefault: (listId: string) => void;
  onArchive: (listId: string) => boolean | Promise<boolean>;
  onRestore: (listId: string) => void;
  onDelete: (listId: string) => boolean | Promise<boolean>;
}) {
  const t = useTranslations("shopping.lists");
  const active = lists.filter((list) => !list.archived);
  const archived = lists.filter((list) => list.archived);
  const selected =
    active.find((list) => list.id === selectedListId) ?? active[0];

  return (
    <section
      aria-labelledby="shopping-lists-heading"
      className="rounded-2xl border border-border bg-surface/70 p-4 shadow-token-sm"
    >
      <h2 id="shopping-lists-heading" className="sr-only">
        {t("heading")}
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="shopping-list-select"
            className="mb-1.5 block text-sm font-medium"
          >
            {t("current")}
          </label>
          <NativeSelect
            id="shopping-list-select"
            value={selected?.id ?? ""}
            disabled={disabled || active.length === 0}
            onChange={(event) => onSelect(event.target.value)}
          >
            {active.map((list) => (
              <option key={list.id} value={list.id}>
                {list.storeName
                  ? t("storeListOption", {
                      name: list.name,
                      store: list.storeName,
                    })
                  : list.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected?.isDefault && (
            <Badge variant="muted" className="min-h-8 gap-1.5 px-3">
              <Star className="size-3.5" aria-hidden="true" />
              {t("defaultBadge")}
            </Badge>
          )}
          <CreateListDialog disabled={disabled} onCreate={onCreate} />
          {selected && (
            <ManageListDialog
              list={selected}
              archived={archived}
              disabled={disabled}
              onRename={onRename}
              onMakeDefault={onMakeDefault}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
      {selected?.storeName && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Store className="size-4 text-primary" aria-hidden="true" />
          {t("storeCaption", { store: selected.storeName })}
        </p>
      )}
    </section>
  );
}

function CreateListDialog({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (name: string, storeName: string | null) => void;
}) {
  const t = useTranslations("shopping.lists");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [storeName, setStoreName] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), storeName.trim() || null);
    setName("");
    setStoreName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <Plus aria-hidden="true" />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("create.title")}</DialogTitle>
            <DialogDescription>{t("create.description")}</DialogDescription>
          </DialogHeader>
          <ListFields
            prefix="create-list"
            name={name}
            storeName={storeName}
            onNameChange={setName}
            onStoreNameChange={setStoreName}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim()}>
              {t("create.confirm")}
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
  disabled,
  onRename,
  onMakeDefault,
  onArchive,
  onRestore,
  onDelete,
}: {
  list: ShoppingListSummary;
  archived: ShoppingListSummary[];
  disabled: boolean;
  onRename: (listId: string, name: string, storeName: string | null) => void;
  onMakeDefault: (listId: string) => void;
  onArchive: (listId: string) => boolean | Promise<boolean>;
  onRestore: (listId: string) => void;
  onDelete: (listId: string) => boolean | Promise<boolean>;
}) {
  const t = useTranslations("shopping.lists");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(list.name);
  const [storeName, setStoreName] = React.useState(list.storeName ?? "");

  React.useEffect(() => {
    if (!open) return;
    setName(list.name);
    setStoreName(list.storeName ?? "");
  }, [list, open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onRename(list.id, name.trim(), storeName.trim() || null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled}>
          <Settings2 aria-hidden="true" />
          {t("manage")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t("manageTitle", { name: list.name })}</DialogTitle>
            <DialogDescription>{t("manageDescription")}</DialogDescription>
          </DialogHeader>
          <ListFields
            prefix={`manage-list-${list.id}`}
            name={name}
            storeName={storeName}
            onNameChange={setName}
            onStoreNameChange={setStoreName}
          />
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
                {t("makeDefault")}
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
              {t("archive")}
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
              {t("delete")}
            </Button>
          </div>
          {archived.length > 0 && (
            <section className="grid gap-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">{t("archived")}</h3>
              {archived.map((archivedList) => (
                <div
                  key={archivedList.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    {archivedList.name}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("restoreNamed", {
                      name: archivedList.name,
                    })}
                    onClick={() => onRestore(archivedList.id)}
                  >
                    {t("restore")}
                  </Button>
                </div>
              ))}
            </section>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim()}>
              {t("save")}
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
  storeName,
  onNameChange,
  onStoreNameChange,
}: {
  prefix: string;
  name: string;
  storeName: string;
  onNameChange: (value: string) => void;
  onStoreNameChange: (value: string) => void;
}) {
  const t = useTranslations("shopping.lists");
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={`${prefix}-name`} className="text-sm font-medium">
          {t("fields.name")}
        </label>
        <Input
          id={`${prefix}-name`}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={120}
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${prefix}-store`} className="text-sm font-medium">
          {t("fields.store")}
        </label>
        <Input
          id={`${prefix}-store`}
          value={storeName}
          onChange={(event) => onStoreNameChange(event.target.value)}
          placeholder={t("fields.storePlaceholder")}
          maxLength={120}
        />
        <p className="text-xs text-muted-foreground">{t("fields.storeHint")}</p>
      </div>
    </div>
  );
}
