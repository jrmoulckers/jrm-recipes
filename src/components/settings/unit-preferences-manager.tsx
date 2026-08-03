"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import {
  createCustomUnitAction,
  deleteCustomUnitAction,
  saveUnitPreferencesAction,
  updateCustomUnitAction,
} from "~/server/units/actions";
import {
  CUSTOM_UNIT_DIMENSIONS,
  type CustomUnitDimension,
  type CustomUnitInputRaw,
  type MeasurementSystemValue,
  type UnitPreferencesInputRaw,
} from "~/server/units/validation";
import {
  defaultUnitFor,
  formatQuantity,
  unitsForDimension,
  type Dimension,
} from "~/lib/units";
import { unitLabel } from "~/lib/unit-labels";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useConfirm } from "~/components/ui/confirm-dialog";

export type UnitPreferencesView = {
  defaultSystem: MeasurementSystemValue;
  volumeUnit: string | null;
  liquidVolumeUnit: string | null;
  dryVolumeUnit: string | null;
  smallVolumeUnit: string | null;
  massUnit: string | null;
  temperatureUnit: string | null;
  autoConvert: boolean;
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
  defaultSystem: "metric",
  volumeUnit: null,
  liquidVolumeUnit: null,
  dryVolumeUnit: null,
  smallVolumeUnit: null,
  massUnit: null,
  temperatureUnit: null,
  autoConvert: true,
};

/** Sentinel for "follow my system default" in a Radix Select (no empty value). */
const FOLLOW = "__follow__";

const DIMENSION_LABELS: Record<CustomUnitDimension, string> = {
  volume: "Volume",
  mass: "Weight",
  count: "Count",
};

const SYSTEMS: {
  value: MeasurementSystemValue;
  label: string;
  hint: string;
}[] = [
  { value: "metric", label: "Metric", hint: "grams, milliliters, °C" },
  { value: "us", label: "US / Imperial", hint: "cups, ounces, °F" },
];

/** Options for a per-dimension default: built-ins + the user's custom units. */
function dimensionOptions(
  dimension: Dimension,
  customUnits: CustomUnitView[],
): { value: string; label: string }[] {
  const builtins = unitsForDimension(dimension).map((u) => ({
    value: u.id,
    label: unitLabel(u.id),
  }));
  const customs = customUnits
    .filter((c) => c.dimension === dimension)
    .map((c) => ({ value: c.name, label: `${c.name} (custom)` }));
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
  name: "",
  abbreviation: "",
  dimension: "volume",
  baseUnit: "",
  baseAmount: "",
  displayAsTrue: false,
};

/** Placeholder hints that adapt to the selected measure so the form teaches by
 *  example. A pinch is a volume, a knob is a weight, a bunch is a count. */
const CUSTOM_UNIT_EXAMPLES: Record<
  CustomUnitDimension,
  { name: string; abbreviation: string; amount: string; equals: string }
> = {
  volume: {
    name: "e.g. pinch",
    abbreviation: "e.g. pn",
    amount: "e.g. 0.0625",
    equals: "a pinch ≈ 1/16 tsp",
  },
  mass: {
    name: "e.g. knob",
    abbreviation: "e.g. kn",
    amount: "e.g. 0.5",
    equals: "a knob ≈ 1/2 oz",
  },
  count: {
    name: "e.g. bunch",
    abbreviation: "e.g. bn",
    amount: "",
    equals: "",
  },
};

function toCustomDraft(unit: CustomUnitView): CustomDraft {
  return {
    name: unit.name,
    abbreviation: unit.abbreviation ?? "",
    dimension: unit.dimension,
    baseUnit: unit.baseUnit ?? "",
    baseAmount: unit.baseAmount != null ? String(unit.baseAmount) : "",
    displayAsTrue: unit.displayAsTrue,
  };
}

type Editing = { kind: "add" } | { kind: "edit"; id: string };

export function UnitPreferencesManager({
  preferences,
  customUnits,
}: {
  preferences: UnitPreferencesView | null;
  customUnits: CustomUnitView[];
}) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<UnitPreferencesView>(
    preferences ?? DEFAULT_PREFS,
  );
  const [savingPrefs, startPrefsTransition] = React.useTransition();

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
    };
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
      | "volumeUnit"
      | "liquidVolumeUnit"
      | "dryVolumeUnit"
      | "smallVolumeUnit"
      | "massUnit"
      | "temperatureUnit",
    value: string,
  ) => savePrefs({ ...prefs, [key]: value === FOLLOW ? null : value });

  return (
    <div className="flex flex-col gap-6">
      {/* Batch default + auto-convert. */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Default measurement system
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Set everything at once. You can still fine-tune each measurement
          below.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {SYSTEMS.map((sys) => {
            const active = prefs.defaultSystem === sys.value;
            return (
              <button
                key={sys.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  savePrefs({ ...prefs, defaultSystem: sys.value })
                }
                className={cn(
                  "flex flex-col rounded-xl border p-4 text-start transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="font-medium">{sys.label}</span>
                <span className="text-sm text-muted-foreground">
                  {sys.hint}
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <span>
            <span className="block font-medium">Auto-convert recipes</span>
            <span className="block text-sm text-muted-foreground">
              Re-express every recipe in your units. Turn off to always see the
              amounts exactly as the author wrote them.
            </span>
          </span>
          <Switch
            checked={prefs.autoConvert}
            onCheckedChange={(checked) =>
              savePrefs({ ...prefs, autoConvert: checked })
            }
            aria-label="Auto-convert recipes to my units"
          />
        </label>
      </section>

      {/* Per-dimension overrides. */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Preferred units
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Fine-tune each measurement. Volume splits by how you measure an
          ingredient, so you can keep liquids in mL but scoop dry goods in cups.
        </p>
        <div
          className={cn(
            "mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
            savingPrefs && "opacity-70",
          )}
        >
          <DimensionPicker
            label="Liquid volume"
            hint="Water, milk, oil, sauces"
            value={prefs.liquidVolumeUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor(
              "volume",
              prefs.defaultSystem,
              "liquid",
            )}
            options={dimensionOptions("volume", customUnits)}
            onChange={(v) => setOverride("liquidVolumeUnit", v)}
          />
          <DimensionPicker
            label="Dry volume"
            hint="Flour, sugar, rice, oats"
            value={prefs.dryVolumeUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor("volume", prefs.defaultSystem, "dry")}
            options={dimensionOptions("volume", customUnits)}
            onChange={(v) => setOverride("dryVolumeUnit", v)}
          />
          <DimensionPicker
            label="Small amounts"
            hint="Spices, herbs, seasonings"
            value={prefs.smallVolumeUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor("volume", prefs.defaultSystem, "small")}
            options={dimensionOptions("volume", customUnits)}
            onChange={(v) => setOverride("smallVolumeUnit", v)}
          />
          <DimensionPicker
            label="Weight"
            hint="Meat, cheese, produce"
            value={prefs.massUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor("mass", prefs.defaultSystem)}
            options={dimensionOptions("mass", customUnits)}
            onChange={(v) => setOverride("massUnit", v)}
          />
          <DimensionPicker
            label="Temperature"
            hint="Oven and cooking temps"
            value={prefs.temperatureUnit ?? FOLLOW}
            defaultUnit={defaultUnitFor("temperature", prefs.defaultSystem)}
            options={dimensionOptions("temperature", customUnits)}
            onChange={(v) => setOverride("temperatureUnit", v)}
          />
        </div>
      </section>

      <CustomUnitsSection customUnits={customUnits} />
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
  const id = React.useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW}>
            Default: {unitLabel(defaultUnit)}
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
}: {
  customUnits: CustomUnitView[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [draft, setDraft] = React.useState<CustomDraft>(EMPTY_CUSTOM);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [isPending, startTransition] = React.useTransition();
  const confirm = useConfirm();

  const nameId = React.useId();
  const abbrId = React.useId();
  const amountId = React.useId();

  function openAdd() {
    setDraft(EMPTY_CUSTOM);
    setFieldErrors({});
    setEditing({ kind: "add" });
  }

  function openEdit(unit: CustomUnitView) {
    setDraft(toCustomDraft(unit));
    setFieldErrors({});
    setEditing({ kind: "edit", id: unit.id });
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
    const isAdd = editing.kind === "add";
    startTransition(() => {
      const run = isAdd
        ? createCustomUnitAction(input)
        : updateCustomUnitAction(editing.id, input);
      void run.then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(isAdd ? "Unit added" : "Unit updated");
        setEditing(null);
        router.refresh();
      });
    });
  }

  async function onDelete(unit: CustomUnitView) {
    const ok = await confirm({
      title: `Delete the “${unit.name}” unit?`,
      description:
        "Recipes keep the unit text. The saved definition is removed until you add it again.",
      confirmLabel: "Delete unit",
    });
    if (!ok) return;
    startTransition(() => {
      void deleteCustomUnitAction(unit.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success("Unit deleted");
        router.refresh();
      });
    });
  }

  // Base-unit options depend on the chosen dimension.
  const baseOptions = React.useMemo(
    () => unitsForDimension(draft.dimension),
    [draft.dimension],
  );

  // Live preview of the equivalence a cook is defining ("1 pinch = 1/16 tsp").
  const preview = React.useMemo(() => {
    const amount = Number(draft.baseAmount);
    if (!draft.name.trim() || !draft.baseUnit || !Number.isFinite(amount)) {
      return null;
    }
    return `1 ${draft.name.trim()} = ${formatQuantity(amount, draft.baseUnit)} ${draft.baseUnit}`;
  }, [draft.name, draft.baseUnit, draft.baseAmount]);

  const example = CUSTOM_UNIT_EXAMPLES[draft.dimension];
  const unitName = draft.name.trim() || "unit";
  const displayAsTrueHint =
    preview != null
      ? `Recipes show “${formatQuantity(Number(draft.baseAmount), draft.baseUnit)} ${draft.baseUnit}” instead of “${unitName}”.`
      : `Recipes show the amount it equals instead of the word “${unitName}”.`;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-token">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Custom units
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Add the units your family cooks by. A pinch, a knob, a splash. And
            optionally tie them to a real amount so recipes can convert.
          </p>
        </div>
        <Button onClick={openAdd} size="sm" className="shrink-0">
          <Plus /> Add unit
        </Button>
      </div>

      {customUnits.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
          <span className="bg-primary/12 inline-flex size-12 items-center justify-center rounded-2xl text-primary">
            <Ruler className="size-6" aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            No custom units yet. Add one like a “pinch” set to 1/16 teaspoon.
          </p>
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
                  <Badge variant="outline">
                    {DIMENSION_LABELS[unit.dimension]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {unit.baseUnit && unit.baseAmount != null
                    ? `1 ${unit.name} = ${formatQuantity(unit.baseAmount, unit.baseUnit)} ${unit.baseUnit}`
                    : "Display only. No conversion"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${unit.name}`}
                  onClick={() => openEdit(unit)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${unit.name}`}
                  onClick={() => onDelete(unit)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={onSubmit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>
                {editing?.kind === "add" ? "Add custom unit" : "Edit unit"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={nameId}>Name</Label>
                <Input
                  id={nameId}
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder={example.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoFocus
                />
                {fieldErrors.name?.[0] ? (
                  <p className="text-sm text-destructive">
                    {fieldErrors.name[0]}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={abbrId}>Short label (optional)</Label>
                <Input
                  id={abbrId}
                  value={draft.abbreviation}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, abbreviation: e.target.value }))
                  }
                  placeholder={example.abbreviation}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Measures</Label>
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
                          baseUnit: "",
                        }))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {DIMENSION_LABELS[dim]}
                    </button>
                  );
                })}
              </div>
            </div>

            {draft.dimension !== "count" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={amountId}>Equal to (amount)</Label>
                    <Input
                      id={amountId}
                      value={draft.baseAmount}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, baseAmount: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder={example.amount}
                      aria-invalid={Boolean(fieldErrors.baseAmount)}
                    />
                    {fieldErrors.baseAmount?.[0] ? (
                      <p className="text-sm text-destructive">
                        {fieldErrors.baseAmount[0]}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Of unit</Label>
                    <Select
                      value={draft.baseUnit || FOLLOW}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          baseUnit: v === FOLLOW ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-invalid={Boolean(fieldErrors.baseUnit)}
                      >
                        <SelectValue placeholder="Choose a unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FOLLOW}>
                          None (display only)
                        </SelectItem>
                        {baseOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {unitLabel(u.id)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.baseUnit?.[0] ? (
                      <p className="text-sm text-destructive">
                        {fieldErrors.baseUnit[0]}
                      </p>
                    ) : null}
                  </div>
                </div>

                {preview ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {preview}
                  </p>
                ) : null}

                <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">
                      Show the real amount in recipes
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {displayAsTrueHint}
                    </span>
                  </span>
                  <Switch
                    checked={draft.displayAsTrue}
                    onCheckedChange={(checked) =>
                      setDraft((d) => ({ ...d, displayAsTrue: checked }))
                    }
                    aria-label="Show the real amount in recipes instead of the unit name"
                  />
                </label>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Count units (like “bunch” or “clove”) are shown as written and
                aren&apos;t converted.
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Saving…"
                  : editing?.kind === "add"
                    ? "Add unit"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
