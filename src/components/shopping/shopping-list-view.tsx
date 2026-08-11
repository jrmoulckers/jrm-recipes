'use client';

import * as React from 'react';

import { cn } from '~/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { describeQuantity, SHOPPING_CATEGORIES, type ShoppingCategory } from '~/lib/shopping-list';
import { ALLERGEN_LABELS, type Allergen } from '~/lib/allergens';
import { allergenConflicts } from '~/lib/dietary-match';
import { formatList } from '~/lib/i18n-format';
import { parseAmount } from '~/lib/units';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { CloseButton } from '~/components/ui/close-button';
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
import { Badge } from '~/components/ui/badge';
import { EmptyState } from '~/components/ui/empty-state';
import { ShoppingHistory, type ShoppingHistoryEntry } from './shopping-history';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Package,
  Plus,
  Route,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { ShoppingListExportMenu } from './shopping-list-export-menu';
import {
  saveIngredientPackageDraftInput,
  type SaveIngredientPackageInput,
} from '~/server/shopping/validation';
import { useShoppingCategoryLabels } from './shopping-localization';

export type ShoppingViewItem = {
  id: string;
  item: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  purchaseQuantity?: number | null;
  purchaseUnit?: string | null;
  packageCount?: number | null;
  packageAmount?: number | null;
  packageUnit?: string | null;
  packageLabel?: string | null;
  note: string | null;
  category: ShoppingCategory;
  optional?: boolean;
  checked: boolean;
  /** Best-effort allergens detected in the item name (issue #432). */
  allergens?: Allergen[];
  routePreferredListId?: string | null;
  routeAlternativeListIds?: string[];
  packageRoundBehavior?: 'inherit' | 'enable' | 'disable';
};

export type ShoppingListOption = {
  id: string;
  name: string;
  /** Store names for export headers; empty when the list has no stores. */
  storeNames: string[];
  isDefault: boolean;
};

export type ManualEntryDraft = {
  item: string;
  quantity?: number | null;
  unit?: string | null;
};

export type PackagePreferenceDraft = Omit<SaveIngredientPackageInput, 'itemId'>;

export type PackagePreferenceResult =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Record<string, string[]>;
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
  avoidAllergens,
  onToggle,
  onRemove,
  onSetCategory,
  listOptions,
  currentListId,
  onMove,
  onSavePackage,
  categoryLabels,
}: {
  item: ShoppingViewItem;
  disabled: boolean;
  avoidAllergens: Allergen[];
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
  onSetCategory: (id: string, category: ShoppingCategory) => void;
  listOptions: ShoppingListOption[];
  currentListId?: string;
  onMove?: (
    itemId: string,
    targetListId: string,
    rememberRoute: boolean,
    alternativeListIds: string[],
  ) => void;
  onSavePackage?: (
    itemId: string,
    draft: PackagePreferenceDraft,
  ) => Promise<PackagePreferenceResult>;
  categoryLabels: Readonly<Record<ShoppingCategory, string>>;
}) {
  const locale = useLocale();
  const amount = describeQuantity(item, locale);
  const purchaseAmount =
    item.purchaseQuantity != null && item.purchaseUnit
      ? describeQuantity(
          {
            quantity: item.purchaseQuantity,
            quantityMax: null,
            unit: item.purchaseUnit,
          },
          locale,
        )
      : '';
  const alerts = allergenConflicts(avoidAllergens, item.allergens ?? []);
  const t = useTranslations('shopping');
  const allergenDisclaimer = t('allergens.disclaimer');
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(item.id, !item.checked)}
        role="checkbox"
        aria-checked={item.checked}
        className="flex min-h-11 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-muted disabled:opacity-50"
      >
        <span
          className={cn(
            'flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-md border-2 text-[10px] transition-colors',
            item.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
          )}
          aria-hidden
        >
          {item.checked ? <Check className="size-3.5" /> : ''}
        </span>
        <span
          className={cn(
            'flex-1 text-[0.95rem]',
            item.checked && 'text-muted-foreground line-through',
          )}
        >
          <span className="font-medium">{item.item}</span>
          {item.note && <span className="text-muted-foreground">, {item.note}</span>}
          {item.packageLabel && item.packageCount == null ? (
            <span className="text-muted-foreground">
              {', '}
              {item.packageLabel}
            </span>
          ) : null}
          {amount && (
            <span className="mt-0.5 flex flex-wrap gap-x-1 text-sm text-muted-foreground">
              <span>{t('item.required', { quantity: amount })}</span>
              {item.packageCount != null && purchaseAmount ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-foreground">
                    {item.packageLabel
                      ? t('package.guidance.withLabel', {
                          count: item.packageCount,
                          label: item.packageLabel,
                          quantity: purchaseAmount,
                        })
                      : t('package.guidance.packages', {
                          count: item.packageCount,
                          quantity: purchaseAmount,
                        })}
                  </span>
                </>
              ) : null}
            </span>
          )}
          {item.optional && (
            <Badge variant="muted" className="ms-2 align-middle">
              {t('item.optional')}
            </Badge>
          )}
          {alerts.length > 0 && (
            <Badge
              variant="warning"
              className="ms-2 gap-1 align-middle"
              title={allergenDisclaimer}
              aria-label={t('allergens.warning', {
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
          {(item.routeAlternativeListIds?.length ?? 0) > 0 && (
            <span className="ms-2 block text-xs text-muted-foreground sm:inline">
              {t('routing.alsoAt', {
                stores: formatList(
                  item.routeAlternativeListIds!.map(
                    (id) => listOptions.find((list) => list.id === id)?.name ?? id,
                  ),
                  locale,
                ),
              })}
            </span>
          )}
        </span>
      </button>
      {onMove && currentListId && listOptions.length > 1 && (
        <MoveRouteDialog
          item={item}
          listOptions={listOptions}
          currentListId={currentListId}
          disabled={disabled}
          onMove={onMove}
        />
      )}
      {onSavePackage && currentListId && listOptions.length > 0 && (
        <PackagePreferenceDialog
          item={item}
          listOptions={listOptions}
          currentListId={currentListId}
          disabled={disabled}
          onSave={onSavePackage}
        />
      )}
      <label className="sr-only" htmlFor={`aisle-${item.id}`}>
        {t('item.aisleFor', { item: item.item })}
      </label>
      <select
        id={`aisle-${item.id}`}
        value={item.category}
        disabled={disabled}
        onChange={(e) => onSetCategory(item.id, e.target.value as ShoppingCategory)}
        title={t('item.changeAisle')}
        className="shrink-0 rounded-md border border-transparent bg-transparent px-1 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:border-border hover:text-foreground focus:border-border focus:opacity-100 focus-visible:border-border focus-visible:opacity-100 disabled:opacity-50 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {SHOPPING_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {categoryLabels[c]}
          </option>
        ))}
      </select>
      <CloseButton
        tone="danger"
        disabled={disabled}
        onClick={() => onRemove(item.id)}
        label={t('item.remove', { item: item.item })}
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </li>
  );
}

function PackagePreferenceDialog({
  item,
  listOptions,
  currentListId,
  disabled,
  onSave,
}: {
  item: ShoppingViewItem;
  listOptions: ShoppingListOption[];
  currentListId: string;
  disabled: boolean;
  onSave: (itemId: string, draft: PackagePreferenceDraft) => Promise<PackagePreferenceResult>;
}) {
  const locale = useLocale();
  const t = useTranslations('shopping');
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [preferredListId, setPreferredListId] = React.useState(currentListId);
  const [roundBehavior, setRoundBehavior] =
    React.useState<PackagePreferenceDraft['packageRoundBehavior']>('inherit');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const fieldHintId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    setAmount(item.packageAmount != null ? String(item.packageAmount) : '');
    setUnit(item.packageUnit ?? '');
    setLabel(item.packageLabel ?? '');
    setPreferredListId(item.routePreferredListId ?? currentListId);
    setRoundBehavior(item.packageRoundBehavior ?? 'inherit');
    setFieldErrors({});
    setError('');
  }, [currentListId, item, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAmount = amount.trim();
    const normalizedAmount = parseAmount(trimmedAmount, locale);
    if (trimmedAmount && (normalizedAmount == null || normalizedAmount <= 0)) {
      setFieldErrors({ packageAmount: [t('package.errors.amount')] });
      return;
    }
    const parsed = saveIngredientPackageDraftInput.safeParse({
      packageAmount: normalizedAmount ?? undefined,
      packageUnit: unit.trim() || undefined,
      packageLabel: label.trim() || undefined,
      packageRoundBehavior: roundBehavior,
    });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      const localized: Record<string, string[]> = {};
      if (errors.packageAmount) {
        localized.packageAmount = [t('package.errors.sizePair')];
      }
      if (errors.packageUnit) {
        localized.packageUnit = [t('package.errors.sizePair')];
      }
      if (errors.packageLabel) {
        localized.packageLabel = [t('package.errors.labelNeedsSize')];
      }
      setFieldErrors(localized);
      return;
    }
    setFieldErrors({});
    setError('');
    setSaving(true);
    try {
      const result = await onSave(item.id, {
        listId: currentListId,
        preferredListId,
        packageAmount: parsed.data.packageAmount,
        packageUnit: parsed.data.packageUnit,
        packageLabel: parsed.data.packageLabel,
        packageRoundBehavior: parsed.data.packageRoundBehavior,
      });
      if (!result.ok) {
        setError(result.error ?? t('package.errors.save'));
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      setOpen(false);
    } catch {
      setError(t('package.errors.save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={t('package.editAria', { item: item.item })}
          title={t('package.edit')}
          className="opacity-0 focus:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Package aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('package.title', { item: item.item })}</DialogTitle>
            <DialogDescription>{t('package.description')}</DialogDescription>
          </DialogHeader>
          <p id={fieldHintId} className="sr-only">
            {t('package.description')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor={`package-amount-${item.id}`}>{t('package.amount')}</label>
              <Input
                id={`package-amount-${item.id}`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                disabled={saving}
                aria-invalid={Boolean(fieldErrors.packageAmount)}
                aria-describedby={
                  fieldErrors.packageAmount ? `package-amount-error-${item.id}` : fieldHintId
                }
                autoFocus
              />
              {fieldErrors.packageAmount?.[0] ? (
                <p id={`package-amount-error-${item.id}`} className="text-sm text-destructive">
                  {fieldErrors.packageAmount[0]}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={`package-unit-${item.id}`}>{t('package.unit')}</label>
              <Input
                id={`package-unit-${item.id}`}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={40}
                disabled={saving}
                aria-invalid={Boolean(fieldErrors.packageUnit)}
                aria-describedby={
                  fieldErrors.packageUnit ? `package-unit-error-${item.id}` : fieldHintId
                }
              />
              {fieldErrors.packageUnit?.[0] ? (
                <p id={`package-unit-error-${item.id}`} className="text-sm text-destructive">
                  {fieldErrors.packageUnit[0]}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`package-label-${item.id}`}>{t('package.label')}</label>
            <Input
              id={`package-label-${item.id}`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={120}
              placeholder={t('package.labelPlaceholder')}
              disabled={saving}
              aria-invalid={Boolean(fieldErrors.packageLabel)}
              aria-describedby={
                fieldErrors.packageLabel ? `package-label-error-${item.id}` : fieldHintId
              }
            />
            {fieldErrors.packageLabel?.[0] ? (
              <p id={`package-label-error-${item.id}`} className="text-sm text-destructive">
                {fieldErrors.packageLabel[0]}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`package-store-${item.id}`}>{t('package.preferredStore')}</label>
            <NativeSelect
              id={`package-store-${item.id}`}
              value={preferredListId}
              onChange={(event) => setPreferredListId(event.target.value)}
              disabled={saving}
            >
              {listOptions.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`package-round-${item.id}`}>{t('package.rounding.label')}</label>
            <NativeSelect
              id={`package-round-${item.id}`}
              value={roundBehavior}
              onChange={(event) =>
                setRoundBehavior(
                  event.target.value as PackagePreferenceDraft['packageRoundBehavior'],
                )
              }
              disabled={saving || !amount.trim() || !unit.trim()}
            >
              <option value="inherit">{t('package.rounding.inherit')}</option>
              <option value="enable">{t('package.rounding.enable')}</option>
              <option value="disable">{t('package.rounding.disable')}</option>
            </NativeSelect>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={saving}>
                {t('package.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" loading={saving}>
              {t('package.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function MoveRouteDialog({
  item,
  listOptions,
  currentListId,
  disabled,
  onMove,
}: {
  item: ShoppingViewItem;
  listOptions: ShoppingListOption[];
  currentListId: string;
  disabled: boolean;
  onMove: (
    itemId: string,
    targetListId: string,
    rememberRoute: boolean,
    alternativeListIds: string[],
  ) => void;
}) {
  const t = useTranslations('shopping');
  const [open, setOpen] = React.useState(false);
  const firstDestination =
    listOptions.find((list) => list.id !== currentListId)?.id ?? currentListId;
  const [targetListId, setTargetListId] = React.useState(firstDestination);
  const [rememberRoute, setRememberRoute] = React.useState(false);
  const [alternativeListIds, setAlternativeListIds] = React.useState<string[]>(
    item.routeAlternativeListIds ?? [],
  );

  React.useEffect(() => {
    if (!open) return;
    setTargetListId(firstDestination);
    setRememberRoute(false);
    setAlternativeListIds(
      (item.routeAlternativeListIds ?? []).filter((id) => id !== firstDestination),
    );
  }, [firstDestination, item.routeAlternativeListIds, open]);

  const alternatives = listOptions.filter((list) => list.id !== targetListId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={t('routing.moveItem', { item: item.item })}
          title={t('routing.move')}
          className="opacity-0 focus:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Route aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('routing.title', { item: item.item })}</DialogTitle>
          <DialogDescription>{t('routing.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label htmlFor={`route-target-${item.id}`} className="text-sm font-medium">
            {t('routing.preferred')}
          </label>
          <NativeSelect
            id={`route-target-${item.id}`}
            value={targetListId}
            onChange={(event) => {
              const next = event.target.value;
              setTargetListId(next);
              setAlternativeListIds((ids) => ids.filter((id) => id !== next));
            }}
          >
            {listOptions.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 text-sm">
          <Checkbox
            checked={rememberRoute}
            onCheckedChange={(value) => setRememberRoute(value === true)}
          />
          <span>
            <span className="block font-medium">{t('routing.remember')}</span>
            <span className="block text-xs text-muted-foreground">{t('routing.rememberHint')}</span>
          </span>
        </label>
        {rememberRoute && alternatives.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t('routing.alternatives')}</legend>
            {alternatives.map((list) => (
              <label
                key={list.id}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={alternativeListIds.includes(list.id)}
                  onCheckedChange={(value) =>
                    setAlternativeListIds((ids) =>
                      value === true ? [...ids, list.id] : ids.filter((id) => id !== list.id),
                    )
                  }
                />
                {list.name}
              </label>
            ))}
          </fieldset>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('routing.cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={targetListId === currentListId}
            onClick={() => {
              onMove(item.id, targetListId, rememberRoute, alternativeListIds);
              setOpen(false);
            }}
          >
            {t('routing.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkMoveDialog({
  itemIds,
  listOptions,
  currentListId,
  disabled,
  onMove,
}: {
  itemIds: string[];
  listOptions: ShoppingListOption[];
  currentListId: string;
  disabled: boolean;
  onMove: (itemIds: string[], targetListId: string) => void;
}) {
  const t = useTranslations('shopping.routing.bulk');
  const destinations = listOptions.filter((list) => list.id !== currentListId);
  const firstDestinationId = destinations[0]?.id ?? '';
  const [open, setOpen] = React.useState(false);
  const [targetListId, setTargetListId] = React.useState(firstDestinationId);

  React.useEffect(() => {
    if (!open) return;
    setTargetListId(firstDestinationId);
  }, [firstDestinationId, open]);

  if (destinations.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || itemIds.length === 0}>
          <ArrowRightLeft aria-hidden="true" />
          {t('trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('title', { count: itemIds.length })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label htmlFor="bulk-move-target" className="text-sm font-medium">
            {t('destination')}
          </label>
          <NativeSelect
            id="bulk-move-target"
            value={targetListId}
            onChange={(event) => setTargetListId(event.target.value)}
          >
            {destinations.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={!targetListId}
            onClick={() => {
              onMove(itemIds, targetListId);
              setOpen(false);
              requestAnimationFrame(() =>
                document.getElementById('shopping-history-summary')?.focus(),
              );
            }}
          >
            {t('confirm', { count: itemIds.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  onUncheckAll,
  onClearAll,
  historyEntries = [],
  onRestoreHistory,
  listOptions = [],
  currentListId,
  onMove,
  onBulkMove,
  onSavePackage,
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
  onUncheckAll: () => void;
  onClearAll: () => void;
  historyEntries?: ShoppingHistoryEntry[];
  onRestoreHistory?: (entry: ShoppingHistoryEntry) => void;
  listOptions?: ShoppingListOption[];
  currentListId?: string;
  onMove?: (
    itemId: string,
    targetListId: string,
    rememberRoute: boolean,
    alternativeListIds: string[],
  ) => void;
  onBulkMove?: (itemIds: string[], targetListId: string) => void;
  onSavePackage?: (
    itemId: string,
    draft: PackagePreferenceDraft,
  ) => Promise<PackagePreferenceResult>;
}) {
  const [name, setName] = React.useState('');
  const [qty, setQty] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [quantityError, setQuantityError] = React.useState('');
  const locale = useLocale();
  const t = useTranslations('shopping');
  const categoryLabels = useShoppingCategoryLabels();

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const groups = React.useMemo(() => groupUnchecked(unchecked), [unchecked]);
  const currentList =
    listOptions.find((list) => list.id === currentListId) ??
    ({
      id: currentListId ?? 'current',
      name: t('page.title'),
      storeNames: [],
      isDefault: true,
    } satisfies ShoppingListOption);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const trimmedQty = qty.trim();
    const parsedQty = trimmedQty === '' ? null : parseAmount(trimmedQty, locale);
    if (trimmedQty && (parsedQty == null || parsedQty <= 0)) {
      setQuantityError(t('manual.quantityError'));
      return;
    }
    setQuantityError('');
    onAddManual({
      item: trimmed,
      quantity: parsedQty,
      unit: unit.trim() || null,
    });
    setName('');
    setQty('');
    setUnit('');
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={submitManual}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface/50 p-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="add-item" className="text-xs text-muted-foreground">
            {t('manual.itemLabel')}
          </label>
          <Input
            id="add-item"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('manual.itemPlaceholder')}
            maxLength={300}
            disabled={disabled}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <label htmlFor="add-qty" className="text-xs text-muted-foreground">
            {t('manual.quantityLabel')}
          </label>
          <Input
            id="add-qty"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              if (quantityError) setQuantityError('');
            }}
            inputMode="decimal"
            placeholder="2"
            disabled={disabled}
            aria-invalid={Boolean(quantityError)}
            aria-describedby={quantityError ? 'add-qty-error' : undefined}
          />
          {quantityError ? (
            <p id="add-qty-error" role="alert" className="text-xs text-destructive">
              {quantityError}
            </p>
          ) : null}
        </div>
        <div className="flex w-24 flex-col gap-1">
          <label htmlFor="add-unit" className="text-xs text-muted-foreground">
            {t('manual.unitLabel')}
          </label>
          <Input
            id="add-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={t('manual.unitPlaceholder')}
            maxLength={40}
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled || !name.trim()}>
          <Plus /> {t('manual.add')}
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<ShoppingCart />}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {[
                t('summary.toBuy', { count: unchecked.length }),
                checked.length > 0 ? t('summary.inCart', { count: checked.length }) : null,
                storageNote,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <ShoppingListExportMenu items={items} list={currentList} disabled={disabled} />
              {onBulkMove && currentListId ? (
                <BulkMoveDialog
                  itemIds={unchecked.map((item) => item.id)}
                  listOptions={listOptions}
                  currentListId={currentListId}
                  disabled={disabled}
                  onMove={onBulkMove}
                />
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || checked.length === 0}
                onClick={onUncheckAll}
              >
                {t('actions.uncheckAll')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || checked.length === 0}
                onClick={onClearChecked}
              >
                <Trash2 aria-hidden="true" />
                {t('actions.removeCompleted')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={disabled || items.length === 0}
                onClick={onClearAll}
              >
                <Trash2 /> {t('actions.clearAll')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.category}>
                <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {categoryLabels[group.category]}
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
                      listOptions={listOptions}
                      currentListId={currentListId}
                      onMove={onMove}
                      onSavePackage={onSavePackage}
                      categoryLabels={categoryLabels}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {checked.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.inCart')}
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
                    listOptions={listOptions}
                    currentListId={currentListId}
                    onMove={onMove}
                    onSavePackage={onSavePackage}
                    categoryLabels={categoryLabels}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {onRestoreHistory ? (
        <ShoppingHistory
          entries={historyEntries}
          disabled={disabled}
          onRestore={onRestoreHistory}
        />
      ) : null}
    </div>
  );
}
