"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import {
  describeQuantity,
  formatShoppingListText,
  SHOPPING_CATEGORIES,
  SHOPPING_CATEGORY_LABELS,
  type ShoppingCategory,
} from "~/lib/shopping-list";
import { ALLERGEN_LABELS, type Allergen } from "~/lib/allergens";
import { allergenConflicts } from "~/lib/dietary-match";
import { toast } from "sonner";
import { formatList } from "~/lib/i18n-format";
import { Button } from "~/components/ui/button";
import { CloseButton } from "~/components/ui/close-button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/ui/empty-state";
import {
  AlertTriangle,
  Check,
  Plus,
  Share2,
  ShoppingCart,
  Trash2,
} from "lucide-react";

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
  /** Best-effort allergens detected in the item name (issue #432). */
  allergens?: Allergen[];
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

/**
 * "Send list". Hand the active list to a partner via the native share sheet,
 * falling back to copy-to-clipboard as tidy grouped text (issue #408). Checked
 * items are excluded so the recipient only sees what's left to buy.
 */
function ShareListButton({
  items,
  disabled,
}: {
  items: ShoppingViewItem[];
  disabled: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const t = useTranslations("shopping");
  const remaining = items.filter((item) => !item.checked).length;

  async function onSend() {
    const text = formatShoppingListText(items, { title: t("share.title") });
    if (!text) {
      toast.info(t("toasts.nothingToSend"));
      return;
    }
    setBusy(true);
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        try {
          await navigator.share({ title: t("share.titleText"), text });
          return;
        } catch (error) {
          // User dismissed the sheet. Stop. Any other failure falls through
          // to the clipboard so the list still gets out.
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }
      await navigator.clipboard.writeText(text);
      toast.success(t("toasts.listCopied"));
    } catch {
      toast.error(t("toasts.shareFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || busy || remaining === 0}
      onClick={() => void onSend()}
    >
      <Share2 /> {t("share.send")}
    </Button>
  );
}

function ItemRow({
  item,
  disabled,
  avoidAllergens,
  onToggle,
  onRemove,
  onSetCategory,
}: {
  item: ShoppingViewItem;
  disabled: boolean;
  avoidAllergens: Allergen[];
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
  onSetCategory: (id: string, category: ShoppingCategory) => void;
}) {
  const amount = describeQuantity(item);
  const alerts = allergenConflicts(avoidAllergens, item.allergens ?? []);
  const locale = useLocale();
  const t = useTranslations("shopping");
  const allergenDisclaimer = t("allergens.disclaimer");
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(item.id, !item.checked)}
        aria-pressed={item.checked}
        className="flex flex-1 items-baseline gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-muted disabled:opacity-50"
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
            <span className="text-muted-foreground">, {item.note}</span>
          )}
          {item.optional && (
            <Badge variant="muted" className="ms-2 align-middle">
              {t("item.optional")}
            </Badge>
          )}
          {alerts.length > 0 && (
            <Badge
              variant="warning"
              className="ms-2 gap-1 align-middle"
              title={allergenDisclaimer}
              aria-label={t("allergens.warning", {
                allergens: formatList(
                  alerts.map((a) => ALLERGEN_LABELS[a].toLowerCase()),
                  locale,
                ),
                disclaimer: allergenDisclaimer,
              })}
            >
              <AlertTriangle className="size-3" aria-hidden />
              {formatList(
                alerts.map((a) => ALLERGEN_LABELS[a]),
                locale,
              )}
            </Badge>
          )}
        </span>
      </button>
      <label className="sr-only" htmlFor={`aisle-${item.id}`}>
        {t("item.aisleFor", { item: item.item })}
      </label>
      <select
        id={`aisle-${item.id}`}
        value={item.category}
        disabled={disabled}
        onChange={(e) =>
          onSetCategory(item.id, e.target.value as ShoppingCategory)
        }
        aria-label={t("item.aisleFor", { item: item.item })}
        title={t("item.changeAisle")}
        className="shrink-0 rounded-md border border-transparent bg-transparent px-1 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:border-border hover:text-foreground focus-visible:border-border focus-visible:opacity-100 disabled:opacity-50 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {SHOPPING_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {SHOPPING_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <CloseButton
        tone="danger"
        disabled={disabled}
        onClick={() => onRemove(item.id)}
        label={t("item.remove", { item: item.item })}
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </li>
  );
}

export function ShoppingListView({
  items,
  disabled = false,
  storageNote,
  avoidAllergens = [],
  onAddManual,
  onToggle,
  onRemove,
  onSetCategory,
  onClearChecked,
  onClearAll,
}: {
  items: ShoppingViewItem[];
  disabled?: boolean;
  /** Optional caption explaining where the list is stored. */
  storageNote?: string;
  /**
   * Allergens the active family member must avoid (issue #432). Lines whose
   * detected allergens intersect this set get a best-effort warning marker.
   */
  avoidAllergens?: Allergen[];
  onAddManual: (entry: ManualEntryDraft) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
  onSetCategory: (id: string, category: ShoppingCategory) => void;
  onClearChecked: () => void;
  onClearAll: () => void;
}) {
  const [name, setName] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const t = useTranslations("shopping");

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
      quantity:
        parsedQty != null && Number.isFinite(parsedQty) ? parsedQty : null,
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
            {t("manual.itemLabel")}
          </label>
          <Input
            id="add-item"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("manual.itemPlaceholder")}
            maxLength={300}
            disabled={disabled}
          />
        </div>
        <div className="flex w-20 flex-col gap-1">
          <label htmlFor="add-qty" className="text-xs text-muted-foreground">
            {t("manual.quantityLabel")}
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
            {t("manual.unitLabel")}
          </label>
          <Input
            id="add-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={t("manual.unitPlaceholder")}
            maxLength={40}
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled || !name.trim()}>
          <Plus /> {t("manual.add")}
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<ShoppingCart />}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {[
                t("summary.toBuy", { count: unchecked.length }),
                checked.length > 0
                  ? t("summary.inCart", { count: checked.length })
                  : null,
                storageNote,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="flex gap-2">
              <ShareListButton items={items} disabled={disabled} />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || checked.length === 0}
                onClick={onClearChecked}
              >
                {t("actions.clearChecked")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={disabled || items.length === 0}
                onClick={onClearAll}
              >
                <Trash2 /> {t("actions.clearAll")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.category}>
                <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {SHOPPING_CATEGORY_LABELS[group.category]}
                </h2>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      disabled={disabled}
                      avoidAllergens={avoidAllergens}
                      onToggle={onToggle}
                      onRemove={onRemove}
                      onSetCategory={onSetCategory}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {checked.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sections.inCart")}
              </h2>
              <ul className="flex flex-col">
                {checked.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    disabled={disabled}
                    avoidAllergens={avoidAllergens}
                    onToggle={onToggle}
                    onRemove={onRemove}
                    onSetCategory={onSetCategory}
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
