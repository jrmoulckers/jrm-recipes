'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { friendlyError } from '~/lib/error-copy';
import { useDialogInitialFocus } from '~/lib/use-initial-focus';
import { useShoppingStore } from '~/lib/shopping-store';
import {
  createCustomUnitAction,
  deleteCustomUnitAction,
  saveUnitPreferencesAction,
  updateCustomUnitAction,
} from '~/server/units/actions';
import {
  CUSTOM_UNIT_DIMENSIONS,
  type CustomUnitDimension,
  type CustomUnitInputRaw,
  type MeasurementSystemValue,
  type UnitPreferencesInputRaw,
  customUnitInput,
} from '~/server/units/validation';
import { defaultUnitFor, formatQuantity, unitsForDimension, type Dimension } from '~/lib/units';
import { unitLabel } from '~/lib/unit-labels';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Switch } from '~/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useConfirm } from '~/components/ui/confirm-dialog';

export type UnitPreferencesView = {
  defaultSystem: MeasurementSystemValue;
  volumeUnit: string | null;
  liquidVolumeUnit: string | null;
  dryVolumeUnit: string | null;
  smallVolumeUnit: string | null;
  massUnit: string | null;
  temperatureUnit: string | null;
  autoConvert: boolean;
  packageRounding: boolean;
};

export type CustomUnitView = {
  id: string;
  name: string;
  abbreviation: string | null;
  dimension: CustomUnitDimension;
  baseUnit: string | null;
  baseAmount: number | null;
  displayAsTrue: boolean;
};

const DEFAULT_PREFS: UnitPreferencesView = {
  defaultSystem: 'metric',
  volumeUnit: null,
  liquidVolumeUnit: null,
  dryVolumeUnit: null,
  smallVolumeUnit: null,
  massUnit: null,
  temperatureUnit: null,
  autoConvert: true,
  packageRounding: false,
};

/** Sentinel for "follow my system default" in a Radix Select (no empty value). */
const FOLLOW = '__follow__';

const SYSTEMS: MeasurementSystemValue[] = ['metric', 'us'];

/** Options for a per-dimension default: built-ins + the user's custom units. */
function dimensionOptions(
  dimension: Dimension,
  customUnits: CustomUnitView[],
  customLabel: (name: string) => string,
): { value: string; label: string }[] {
  const builtins = unitsForDimension(dimension).map((u) => ({
    value: u.id,
    label: unitLabel(u.id),
  }));
  const customs = customUnits
    .filter((c) => c.dimension === dimension)
    .map((c) => ({ value: c.name, label: customLabel(c.name) }));
  return [...builtins, ...customs];
}

type CustomDraft = {
  name: string;
  abbreviation: string;
  dimension: CustomUnitDimension;
  baseUnit: string;
  baseAmount: string;
  displayAsTrue: boolean;
};

const EMPTY_CUSTOM: CustomDraft = {
  name: '',
  abbreviation: '',
  dimension: 'volume',
  baseUnit: '',
  baseAmount: '',
  displayAsTrue: false,
};

function toCustomDraft(unit: CustomUnitView): CustomDraft {
  return {
    name: unit.name,
    abbreviation: unit.abbreviation ?? '',
    dimension: unit.dimension,
    baseUnit: unit.baseUnit ?? '',
    baseAmount: unit.baseAmount != null ? String(unit.baseAmount) : '',
    displayAsTrue: unit.displayAsTrue,
  };
}

type Editing = { kind: 'add' } | { kind: 'edit'; id: string };

export function UnitPreferencesManager({
  preferences,
  customUnits,
  offline = false,
}: {
  preferences: UnitPreferencesView | null;
  customUnits: CustomUnitView[];
  offline?: boolean;
}) {
  const t = useTranslations('settings.units');
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<UnitPreferencesView>(preferences ?? DEFAULT_PREFS);
  const [savingPrefs, startPrefsTransition] = React.useTransition();
  const autoConvertId = React.useId();
  const packageRoundingId = React.useId();
  const localPreferences = useShoppingStore((state) => state.unitPreferences);
  const localPackageRounding = useShoppingStore((state) => state.packageRounding);
  const localCustomUnits = useShoppingStore((state) => state.customUnits);
  const setLocalPreferences = useShoppingStore((state) => state.setUnitPreferences);
  const visibleCustomUnits = offline ? localCustomUnits : customUnits;

  React.useEffect(() => {
    if (!offline) return;
    setPrefs({
      ...DEFAULT_PREFS,
      ...localPreferences,
      packageRounding: localPackageRounding,
    });
  }, [localPackageRounding, localPreferences, offline]);

  // Persist the full preferences state whenever a control changes. Each save
  // sends the complete desired state, so the server row is always authoritative.
  function savePrefs(next: UnitPreferencesView) {
    setPrefs(next);
    const input: UnitPreferencesInputRaw = {
      defaultSystem: next.defaultSystem,
      volumeUnit: next.volumeUnit ?? undefined,
      liquidVolumeUnit: next.liquidVolumeUnit ?? undefined,
      dryVolumeUnit: next.dryVolumeUnit ?? undefined,
      smallVolumeUnit: next.smallVolumeUnit ?? undefined,
      massUnit: next.massUnit ?? undefined,
      temperatureUnit: next.temperatureUnit ?? undefined,
      autoConvert: next.autoConvert,
      packageRounding: next.packageRounding,
    };
    if (offline) {
      setLocalPreferences(
        {
          defaultSystem: next.defaultSystem,
          volumeUnit: next.volumeUnit,
          liquidVolumeUnit: next.liquidVolumeUnit,
          dryVolumeUnit: next.dryVolumeUnit,
          smallVolumeUnit: next.smallVolumeUnit,
          massUnit: next.massUnit,
          temperatureUnit: next.temperatureUnit,
          autoConvert: next.autoConvert,
        },
        next.packageRounding,
      );
      return;
    }
    startPrefsTransition(() => {
      void saveUnitPreferencesAction(input).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          // Roll back to the server's last-known state on failure.
          setPrefs(preferences ?? DEFAULT_PREFS);
          return;
        }
        router.refresh();
      });
    });
  }

  const setOverride = (
    key:
      | 'volumeUnit'
      | 'liquidVolumeUnit'
      | 'dryVolumeUnit'
      | 'smallVolumeUnit'
      | 'massUnit'
      | 'temperatureUnit',
    value: string,
  ) => savePrefs({ ...prefs, [key]: value === FOLLOW ? null : value });

  return (
    <div className="flex flex-col gap-6">
      {/* Batch default + auto-convert. */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t('defaultSystem.title')}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('defaultSystem.description')}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {SYSTEMS.map((sys) => {
            const active = prefs.defaultSystem === sys;
            return (
              <button
                key={sys}
                type="button"
                aria-pressed={active}
                onClick={() => savePrefs({ ...prefs, defaultSystem: sys })}
                disabled={savingPrefs}
                className={cn(
                  'flex min-h-11 flex-col rounded-xl border p-4 text-start transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                )}
              >
                <span className="font-medium">{t(`systems.${sys}.label`)}</span>
                <span className="text-sm text-muted-foreground">{t(`systems.${sys}.hint`)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <span>
            <label htmlFor={autoConvertId} className="block font-medium">
              {t('autoConvert.label')}
            </label>
            <span className="block text-sm text-muted-foreground">
              {t('autoConvert.description')}
            </span>
          </span>
          <Switch
            id={autoConvertId}
            checked={prefs.autoConvert}
            onCheckedChange={(checked) => savePrefs({ ...prefs, autoConvert: checked })}
            aria-label={t('autoConvert.ariaLabel')}
            disabled={savingPrefs}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <span>
            <label htmlFor={packageRoundingId} className="block font-medium">
              {t('packageRounding.label')}
            </label>
            <span className="block text-sm text-muted-foreground">
              {t('packageRounding.description')}
            </span>
          </span>
          <Switch
            id={packageRoundingId}
            checked={prefs.packageRounding}
            onCheckedChange={(checked) => savePrefs({ ...prefs, packageRounding: checked })}
            aria-label={t('packageRounding.ariaLabel')}
            disabled={savingPrefs}
          />
        </div>
        {offline ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {t('offlineNote')}
          </p>
        ) : null}
      </section>

      {/* Per-dimension overrides. */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t('preferred.title')}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('preferred.description')}</p>
        <div
          className={cn(
            'mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
            savingPrefs && 'opacity-70',
          )}
        >
          <DimensionPicker
            label={t('preferred.liquidVolume.label')}
            hint={t('preferred.liquidVolume.hint')}
            value={prefs.liquidVolumeUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor('volume', prefs.defaultSystem, 'liquid')}
            options={dimensionOptions('volume', visibleCustomUnits, (name) =>
              t('custom.optionCustom', { name }),
            )}
            onChange={(v) => setOverride('liquidVolumeUnit', v)}
          />
          <DimensionPicker
            label={t('preferred.dryVolume.label')}
            hint={t('preferred.dryVolume.hint')}
            value={prefs.dryVolumeUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor('volume', prefs.defaultSystem, 'dry')}
            options={dimensionOptions('volume', visibleCustomUnits, (name) =>
              t('custom.optionCustom', { name }),
            )}
            onChange={(v) => setOverride('dryVolumeUnit', v)}
          />
          <DimensionPicker
            label={t('preferred.smallAmounts.label')}
            hint={t('preferred.smallAmounts.hint')}
            value={prefs.smallVolumeUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor('volume', prefs.defaultSystem, 'small')}
            options={dimensionOptions('volume', visibleCustomUnits, (name) =>
              t('custom.optionCustom', { name }),
            )}
            onChange={(v) => setOverride('smallVolumeUnit', v)}
          />
          <DimensionPicker
            label={t('preferred.weight.label')}
            hint={t('preferred.weight.hint')}
            value={prefs.massUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor('mass', prefs.defaultSystem)}
            options={dimensionOptions('mass', visibleCustomUnits, (name) =>
              t('custom.optionCustom', { name }),
            )}
            onChange={(v) => setOverride('massUnit', v)}
          />
          <DimensionPicker
            label={t('preferred.temperature.label')}
            hint={t('preferred.temperature.hint')}
            value={prefs.temperatureUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor('temperature', prefs.defaultSystem)}
            options={dimensionOptions('temperature', visibleCustomUnits, (name) =>
              t('custom.optionCustom', { name }),
            )}
            onChange={(v) => setOverride('temperatureUnit', v)}
          />
        </div>
      </section>

      <CustomUnitsSection customUnits={visibleCustomUnits} offline={offline} />
    </div>
  );
}

function DimensionPicker({
  label,
  hint,
  value,
  defaultUnit,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  defaultUnit: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const t = useTranslations('settings.units');
  const id = React.useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW}>
            {t('preferred.defaultOption', { unit: unitLabel(defaultUnit) })}
          </SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CustomUnitsSection({
  customUnits,
  offline,
}: {
  customUnits: CustomUnitView[];
  offline: boolean;
}) {
  const t = useTranslations('settings.units');
  const router = useRouter();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [draft, setDraft] = React.useState<CustomDraft>(EMPTY_CUSTOM);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [isPending, startTransition] = React.useTransition();
  const confirm = useConfirm();
  const createLocalCustomUnit = useShoppingStore((state) => state.createCustomUnit);
  const updateLocalCustomUnit = useShoppingStore((state) => state.updateCustomUnit);
  const deleteLocalCustomUnit = useShoppingStore((state) => state.deleteCustomUnit);

  const nameId = React.useId();
  const { ref: nameRef, onOpenAutoFocus } = useDialogInitialFocus<HTMLInputElement>();
  const abbrId = React.useId();
  const amountId = React.useId();
  const displayAsTrueId = React.useId();

  function openAdd() {
    setDraft(EMPTY_CUSTOM);
    setFieldErrors({});
    setEditing({ kind: 'add' });
  }

  function openEdit(unit: CustomUnitView) {
    setDraft(toCustomDraft(unit));
    setFieldErrors({});
    setEditing({ kind: 'edit', id: unit.id });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const input: CustomUnitInputRaw = {
      name: draft.name,
      abbreviation: draft.abbreviation.trim() || undefined,
      dimension: draft.dimension,
      baseUnit: draft.baseUnit.trim() || undefined,
      baseAmount: draft.baseAmount.trim() || undefined,
      displayAsTrue: draft.displayAsTrue,
    };
    setFieldErrors({});
    const isAdd = editing.kind === 'add';
    const parsed = customUnitInput.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    if (
      offline &&
      customUnits.some(
        (unit) =>
          unit.name.trim().toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase() &&
          (editing.kind === 'add' || unit.id !== editing.id),
      )
    ) {
      setFieldErrors({ name: [t('custom.validation.duplicate')] });
      return;
    }
    if (offline) {
      const unit = {
        name: parsed.data.name,
        abbreviation: parsed.data.abbreviation ?? null,
        dimension: parsed.data.dimension,
        baseUnit: parsed.data.baseUnit ?? null,
        baseAmount: parsed.data.baseAmount ?? null,
        displayAsTrue: parsed.data.displayAsTrue,
      };
      if (editing.kind === 'add') createLocalCustomUnit(unit);
      else updateLocalCustomUnit(editing.id, unit);
      toast.success(isAdd ? t('custom.toasts.added') : t('custom.toasts.updated'));
      setEditing(null);
      return;
    }
    startTransition(() => {
      const run = isAdd ? createCustomUnitAction(input) : updateCustomUnitAction(editing.id, input);
      void run.then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(isAdd ? t('custom.toasts.added') : t('custom.toasts.updated'));
        setEditing(null);
        router.refresh();
      });
    });
  }

  async function onDelete(unit: CustomUnitView) {
    const ok = await confirm({
      title: t('custom.deleteConfirm.title', { name: unit.name }),
      description: t('custom.deleteConfirm.description'),
      confirmLabel: t('custom.deleteConfirm.confirmLabel'),
    });
    if (!ok) return;
    if (offline) {
      deleteLocalCustomUnit(unit.id);
      toast.success(t('custom.toasts.deleted'));
      return;
    }
    startTransition(() => {
      void deleteCustomUnitAction(unit.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('custom.toasts.deleted'));
        router.refresh();
      });
    });
  }

  // Base-unit options depend on the chosen dimension.
  const baseOptions = React.useMemo(() => unitsForDimension(draft.dimension), [draft.dimension]);

  // Live preview of the equivalence a cook is defining ("1 pinch = 1/16 tsp").
  const preview = React.useMemo(() => {
    const amount = Number(draft.baseAmount);
    if (!draft.name.trim() || !draft.baseUnit || !Number.isFinite(amount)) {
      return null;
    }
    return t('custom.preview', {
      name: draft.name.trim(),
      amount: formatQuantity(amount, draft.baseUnit),
      unit: draft.baseUnit,
    });
  }, [draft.name, draft.baseUnit, draft.baseAmount, t]);

  const example = {
    name: t(`custom.examples.${draft.dimension}.name`),
    abbreviation: t(`custom.examples.${draft.dimension}.abbreviation`),
    amount: t(`custom.examples.${draft.dimension}.amount`),
  };
  const unitName = draft.name.trim() || t('custom.fallbackUnitName');
  const displayAsTrueHint =
    preview != null
      ? t('custom.displayAsTrue.hintWithPreview', {
          amount: formatQuantity(Number(draft.baseAmount), draft.baseUnit),
          unit: draft.baseUnit,
          name: unitName,
        })
      : t('custom.displayAsTrue.hint', { name: unitName });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">{t('custom.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('custom.description')}</p>
        </div>
        <Button onClick={openAdd} size="sm" className="shrink-0">
          <Plus /> {t('custom.addButton')}
        </Button>
      </div>

      {customUnits.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
          <span className="bg-primary/12 inline-flex size-12 items-center justify-center rounded-2xl text-primary">
            <Ruler className="size-6" aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">{t('custom.empty')}</p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {customUnits.map((unit) => (
            <li
              key={unit.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-border p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{unit.name}</span>
                  {unit.abbreviation ? (
                    <Badge variant="secondary">{unit.abbreviation}</Badge>
                  ) : null}
                  <Badge variant="outline">{t(`custom.dimensions.${unit.dimension}`)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {unit.baseUnit && unit.baseAmount != null
                    ? t('custom.preview', {
                        name: unit.name,
                        amount: formatQuantity(unit.baseAmount, unit.baseUnit),
                        unit: unit.baseUnit,
                      })
                    : t('custom.displayOnly')}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('custom.editAria', { name: unit.name })}
                  onClick={() => openEdit(unit)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('custom.deleteAria', { name: unit.name })}
                  onClick={() => onDelete(unit)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" onOpenAutoFocus={onOpenAutoFocus}>
          <form onSubmit={onSubmit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>
                {editing?.kind === 'add'
                  ? t('custom.dialog.addTitle')
                  : t('custom.dialog.editTitle')}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={nameId}>{t('custom.fields.name')}</Label>
                <Input
                  id={nameId}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder={example.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  ref={nameRef}
                />
                {fieldErrors.name?.[0] ? (
                  <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={abbrId}>{t('custom.fields.shortLabel')}</Label>
                <Input
                  id={abbrId}
                  value={draft.abbreviation}
                  onChange={(e) => setDraft((d) => ({ ...d, abbreviation: e.target.value }))}
                  placeholder={example.abbreviation}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>{t('custom.fields.measures')}</Label>
              <div className="flex flex-wrap gap-2">
                {CUSTOM_UNIT_DIMENSIONS.map((dim) => {
                  const active = draft.dimension === dim;
                  return (
                    <button
                      key={dim}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          dimension: dim,
                          // Reset the base unit. It must match the new dimension.
                          baseUnit: '',
                        }))
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {t(`custom.dimensions.${dim}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {draft.dimension !== 'count' ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={amountId}>{t('custom.fields.equalTo')}</Label>
                    <Input
                      id={amountId}
                      value={draft.baseAmount}
                      onChange={(e) => setDraft((d) => ({ ...d, baseAmount: e.target.value }))}
                      inputMode="decimal"
                      placeholder={example.amount}
                      aria-invalid={Boolean(fieldErrors.baseAmount)}
                    />
                    {fieldErrors.baseAmount?.[0] ? (
                      <p className="text-sm text-destructive">{fieldErrors.baseAmount[0]}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t('custom.fields.ofUnit')}</Label>
                    <Select
                      value={draft.baseUnit || FOLLOW}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          baseUnit: v === FOLLOW ? '' : v,
                        }))
                      }
                    >
                      <SelectTrigger aria-invalid={Boolean(fieldErrors.baseUnit)}>
                        <SelectValue placeholder={t('custom.chooseUnit')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FOLLOW}>{t('custom.noneDisplayOnly')}</SelectItem>
                        {baseOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {unitLabel(u.id)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.baseUnit?.[0] ? (
                      <p className="text-sm text-destructive">{fieldErrors.baseUnit[0]}</p>
                    ) : null}
                  </div>
                </div>

                {preview ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {preview}
                  </p>
                ) : null}

                <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
                  <span className="space-y-0.5">
                    <label htmlFor={displayAsTrueId} className="block text-sm font-medium">
                      {t('custom.displayAsTrue.label')}
                    </label>
                    <span className="block text-xs text-muted-foreground">{displayAsTrueHint}</span>
                  </span>
                  <Switch
                    id={displayAsTrueId}
                    checked={draft.displayAsTrue}
                    onCheckedChange={(checked) =>
                      setDraft((d) => ({ ...d, displayAsTrue: checked }))
                    }
                    aria-label={t('custom.displayAsTrue.ariaLabel')}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('custom.countNote')}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={isPending}
              >
                {t('custom.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? t('custom.saving')
                  : editing?.kind === 'add'
                    ? t('custom.addButton')
                    : t('custom.saveChanges')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
