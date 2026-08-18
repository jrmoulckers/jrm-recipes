'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useFriendlyError } from '~/lib/error-copy';
import { formatNutrient } from '~/lib/nutrition';
import {
  TARGET_NUTRIENTS,
  targetRows,
  todayIso,
  type EffectiveNutritionTarget,
} from '~/lib/nutrition-targets';
import type { NutritionKey } from '~/lib/nutrients';
import { deleteNutritionTargetAction, setNutritionTargetAction } from '~/server/dietary/actions';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useConfirm } from '~/components/ui/confirm-dialog';

type Draft = { effectiveFrom: string; values: Partial<Record<NutritionKey, string>> };

const MACROS = TARGET_NUTRIENTS.filter((n) => n.isMacro);
const OTHERS = TARGET_NUTRIENTS.filter((n) => !n.isMacro);

function emptyDraft(): Draft {
  return { effectiveFrom: todayIso(), values: {} };
}

function toDraft(entry: EffectiveNutritionTarget): Draft {
  const values: Partial<Record<NutritionKey, string>> = {};
  for (const n of TARGET_NUTRIENTS) {
    const v = entry.targets[n.key];
    if (typeof v === 'number' && Number.isFinite(v)) values[n.key] = String(v);
  }
  return { effectiveFrom: entry.effectiveFrom, values };
}

/**
 * Set and review a family member's macro targets (issue #1046).
 *
 * The dialog edits *one dated entry at a time* rather than "the current
 * targets", because that is what the underlying fact is: a target starts on a
 * day and stays in force until the next one. Saving with the date of an existing
 * entry corrects it; saving with a new date starts a new chapter and leaves
 * every earlier one intact, which is what keeps a week cooked during a cut
 * scored against the cut.
 *
 * Clearing every field removes that entry entirely — deliberately different from
 * typing zeroes, which would claim the member is aiming for nothing at all.
 */
export function NutritionTargetsDialog({
  profile,
  entries,
  open,
  onOpenChange,
  onChanged,
}: {
  profile: { id: string; name: string };
  entries: EffectiveNutritionTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('dietary.targets');
  const friendlyError = useFriendlyError();
  const confirm = useConfirm();
  const dateId = React.useId();

  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [isPending, startTransition] = React.useTransition();

  // Reopening for another member must not carry the previous member's numbers.
  React.useEffect(() => {
    if (!open) return;
    const current = entries.find((e) => e.effectiveFrom <= todayIso()) ?? null;
    setDraft(current ? toDraft(current) : emptyDraft());
    setFieldErrors({});
  }, [open, entries]);

  function setValue(key: NutritionKey, value: string) {
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const targets: Record<string, string> = {};
    for (const n of TARGET_NUTRIENTS) targets[n.key] = draft.values[n.key]?.trim() ?? '';

    startTransition(() => {
      void setNutritionTargetAction({
        profileId: profile.id,
        effectiveFrom: draft.effectiveFrom,
        targets,
      }).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toasts.saved'));
        onChanged();
      });
    });
  }

  async function onDelete(entry: EffectiveNutritionTarget) {
    const ok = await confirm({
      title: t('confirm.title', { date: entry.effectiveFrom }),
      description: t('confirm.description'),
      confirmLabel: t('confirm.confirmLabel'),
    });
    if (!ok) return;
    startTransition(() => {
      void deleteNutritionTargetAction(entry.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toasts.removed'));
        onChanged();
      });
    });
  }

  function field(nutrient: (typeof TARGET_NUTRIENTS)[number]) {
    const errorKey = `targets.${nutrient.key}`;
    const error = fieldErrors[errorKey]?.[0];
    return (
      <div key={nutrient.key} className="grid gap-1.5">
        <Label htmlFor={`${dateId}-${nutrient.key}`}>
          {nutrient.label} ({nutrient.unit})
        </Label>
        <Input
          id={`${dateId}-${nutrient.key}`}
          value={draft.values[nutrient.key] ?? ''}
          onChange={(e) => setValue(nutrient.key, e.target.value)}
          inputMode="decimal"
          placeholder={t('fields.placeholder')}
          aria-invalid={Boolean(error)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t('title', { name: profile.name })}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={dateId}>{t('fields.effectiveFrom')}</Label>
            <Input
              id={dateId}
              type="date"
              value={draft.effectiveFrom}
              onChange={(e) => setDraft((d) => ({ ...d, effectiveFrom: e.target.value }))}
              aria-describedby={`${dateId}-help`}
              aria-invalid={Boolean(fieldErrors.effectiveFrom)}
            />
            <p id={`${dateId}-help`} className="text-sm text-muted-foreground">
              {t('fields.effectiveFromHelp')}
            </p>
            {fieldErrors.effectiveFrom?.[0] ? (
              <p className="text-sm text-destructive">{fieldErrors.effectiveFrom[0]}</p>
            ) : null}
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium text-foreground">
              {t('fields.macros')}
            </legend>
            {MACROS.map(field)}
          </fieldset>

          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('fields.more')}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{OTHERS.map(field)}</div>
          </details>

          {entries.length > 0 ? (
            <section className="grid gap-2">
              <h3 className="text-sm font-medium text-foreground">{t('history.heading')}</h3>
              <p className="text-sm text-muted-foreground">{t('history.description')}</p>
              <ul className="grid gap-2">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t('history.since', { date: entry.effectiveFrom })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {targetRows(entry.targets)
                          .map(
                            (row) =>
                              `${row.label} ${formatNutrient(row.value, row.decimals)} ${row.unit}`,
                          )
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraft(toDraft(entry))}
                      >
                        {t('history.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('history.remove', { date: entry.effectiveFrom })}
                        onClick={() => onDelete(entry)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('actions.close')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('actions.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
