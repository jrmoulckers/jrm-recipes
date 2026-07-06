"use client";

import * as React from "react";
import { Check, Plus, Trash2, X } from "lucide-react";

import { cn } from "~/lib/utils";
import {
  describeQuantity,
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
} from "~/lib/shopping-list";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";

export type ShoppingViewItem = {
  id: string;
  item: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  note: string | null;
  category: ShoppingCategory;
  optional?: boolean;
  checked: boolean;
};

export type ManualEntryDraft = {
  item: string;
  quantity?: number | null;
  unit?: string | null;
};

function groupUnchecked(items: ShoppingViewItem[]) {
  const map = new Map<ShoppingCategory, ShoppingViewItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return SHOPPING_CATEGORIES.filter((c) => map.has(c)).map((category) => ({
    category,
    items: map
      .get(category)!
      .slice()
      .sort((a, b) => a.item.localeCompare(b.item)),
  }));
}

function ItemRow({
  item,
  disabled,
  onToggle,
  onRemove,
}: {
  item: ShoppingViewItem;
  disabled: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const amount = describeQuantity(item);
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(item.id, !item.checked)}
        aria-pressed={item.checked}
        className="flex flex-1 items-baseline gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-md border-2 text-[10px] transition-colors",
            item.checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border",
          )}
          aria-hidden
        >
          {item.checked ? <Check className="size-3.5" /> : ""}
        </span>
        <span
          className={cn(
            "flex-1 text-[0.95rem]",
            item.checked && "text-muted-foreground line-through",
          )}
        >
          {amount && (
            <span className="font-semibold tabular-nums">{amount} </span>
          )}
          {item.item}
          {item.note && (
            <span className="text-muted-foreground"> — {item.note}</span>
          )}
          {item.optional && (
            <Badge variant="muted" className="ml-2 align-middle">
              optional
            </Badge>
          )}
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.item}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

export function ShoppingListView({
  items,
  disabled = false,
  storageNote,
  onAddManual,
  onToggle,
  onRemove,
  onClearChecked,
  onClearAll,
}: {
  items: ShoppingViewItem[];
  disabled?: boolean;
  /** Optional caption explaining where the list is stored. */
  storageNote?: string;
  onAddManual: (entry: ManualEntryDraft) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
  onClearChecked: () => void;
  onClearAll: () => void;
}) {
  const [name, setName] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState("");

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const groups = React.useMemo(() => groupUnchecked(unchecked), [unchecked]);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedQty = qty.trim() === "" ? null : Number(qty);
    onAddManual({
      item: trimmed,
      quantity: parsedQty != null && Number.isFinite(parsedQty) ? parsedQty : null,
      unit: unit.trim() || null,
    });
    setName("");
    setQty("");
    setUnit("");
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={submitManual}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface/50 p-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="add-item" className="text-xs text-muted-foreground">
            Add an item
          </label>
          <Input
            id="add-item"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Paper towels"
            maxLength={300}
            disabled={disabled}
          />
        </div>
        <div className="flex w-20 flex-col gap-1">
          <label htmlFor="add-qty" className="text-xs text-muted-foreground">
            Qty
          </label>
          <Input
            id="add-qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder="2"
            disabled={disabled}
          />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <label htmlFor="add-unit" className="text-xs text-muted-foreground">
            Unit
          </label>
          <Input
            id="add-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="cups"
            maxLength={40}
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled || !name.trim()}>
          <Plus /> Add
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          Your list is empty. Add items above, or open a recipe and choose
          &ldquo;Add to shopping list&rdquo;.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {unchecked.length} to buy
              {checked.length > 0 && ` · ${checked.length} in cart`}
              {storageNote && ` · ${storageNote}`}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || checked.length === 0}
                onClick={onClearChecked}
              >
                Clear checked
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={disabled || items.length === 0}
                onClick={onClearAll}
              >
                <Trash2 /> Clear all
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.category}>
                <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.category}
                </h2>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      disabled={disabled}
                      onToggle={onToggle}
                      onRemove={onRemove}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {checked.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                In cart
              </h2>
              <ul className="flex flex-col">
                {checked.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    disabled={disabled}
                    onToggle={onToggle}
                    onRemove={onRemove}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
