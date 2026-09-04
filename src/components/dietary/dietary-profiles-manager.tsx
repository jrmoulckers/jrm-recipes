'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, Target, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { useFriendlyError } from '~/lib/error-copy';
import { useDialogInitialFocus } from '~/lib/use-initial-focus';

import {
  createMemberProfileAction,
  deleteMemberProfileAction,
  updateMemberProfileAction,
} from '~/server/dietary/actions';
import { type MemberProfileInputRaw } from '~/server/dietary/validation';
import { ALLERGENS, ALLERGEN_LABELS, type Allergen } from '~/lib/allergens';
import { DIETARY_TAGS, DIETARY_TAG_LABELS, type DietaryTag } from '~/lib/substitutions';
import { formatNutrient } from '~/lib/nutrition';
import {
  selectEffectiveTarget,
  targetRows,
  todayIso,
  type EffectiveNutritionTarget,
} from '~/lib/nutrition-targets';
import { cn } from '~/lib/utils';
import { NutritionTargetsDialog } from '~/components/dietary/nutrition-targets-dialog';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { NativeSelect } from '~/components/ui/native-select';
import { useConfirm } from '~/components/ui/confirm-dialog';

export type MemberProfileView = {
  id: string;
  name: string;
  allergens: Allergen[];
  diets: DietaryTag[];
  groupId: string | null;
  /** Target history, newest first (#1046). Empty when none were ever set. */
  targets: EffectiveNutritionTarget[];
};

type GroupOption = { id: string; name: string };

/** Which form the dialog is showing: adding a new member or editing one. */
type EditingState = { kind: 'add' } | { kind: 'edit'; id: string };

type Draft = {
  name: string;
  allergens: Allergen[];
  diets: DietaryTag[];
  groupId: string;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  allergens: [],
  diets: [],
  groupId: '',
};

function toDraft(profile: MemberProfileView): Draft {
  return {
    name: profile.name,
    allergens: profile.allergens,
    diets: profile.diets,
    groupId: profile.groupId ?? '',
  };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function DietaryProfilesManager({
  profiles,
  groups,
}: {
  profiles: MemberProfileView[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const nameId = React.useId();
  const { ref: nameRef, onOpenAutoFocus } = useDialogInitialFocus<HTMLInputElement>();
  const groupSelectId = React.useId();

  // `null` = dialog closed.
  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const [targetsFor, setTargetsFor] = React.useState<MemberProfileView | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [isPending, startTransition] = React.useTransition();
  const confirm = useConfirm();
  const t = useTranslations('dietary');
  const friendlyError = useFriendlyError();

  const groupName = React.useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setEditing({ kind: 'add' });
  }

  function openEdit(profile: MemberProfileView) {
    setDraft(toDraft(profile));
    setFieldErrors({});
    setEditing({ kind: 'edit', id: profile.id });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const input: MemberProfileInputRaw = {
      name: draft.name,
      allergens: draft.allergens,
      diets: draft.diets,
      groupId: draft.groupId || undefined,
    };
    setFieldErrors({});

    const isAdd = editing.kind === 'add';
    startTransition(() => {
      const run = isAdd
        ? createMemberProfileAction(input)
        : updateMemberProfileAction(editing.id, input);
      void run.then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(isAdd ? t('toasts.added') : t('toasts.updated'));
        setEditing(null);
        router.refresh();
      });
    });
  }

  async function onDelete(profile: MemberProfileView) {
    const ok = await confirm({
      title: t('confirm.remove.title', { name: profile.name }),
      description: t('confirm.remove.description'),
      confirmLabel: t('confirm.remove.confirmLabel'),
    });
    if (!ok) return;
    startTransition(() => {
      void deleteMemberProfileAction(profile.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toasts.removed'));
        router.refresh();
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus /> {t('actions.addFamilyMember')}
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
            <UtensilsCrossed className="size-7" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">{t('empty.title')}</h2>
            <p className="mt-1 max-w-md text-muted-foreground">{t('empty.description')}</p>
          </div>
          <Button onClick={openAdd}>
            <Plus /> {t('actions.addFamilyMember')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-token"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold">{profile.name}</h3>
                  {profile.groupId && groupName.has(profile.groupId) ? (
                    <p className="text-xs text-muted-foreground">
                      {groupName.get(profile.groupId)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('profile.edit', { name: profile.name })}
                    onClick={() => openEdit(profile)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('profile.remove', { name: profile.name })}
                    onClick={() => onDelete(profile)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {profile.allergens.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.allergens.map((a) => (
                    <Badge key={a} variant="warning">
                      {ALLERGEN_LABELS[a]}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {profile.diets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.diets.map((d) => (
                    <Badge key={d} variant="secondary">
                      {DIETARY_TAG_LABELS[d]}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {profile.targets.length > 0 ? (
                <TargetSummary profile={profile} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('profile.noTargets')}</p>
              )}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTargetsFor(profile)}
                >
                  <Target className="size-4" /> {t('actions.setTargets')}
                </Button>
              </div>

              {profile.allergens.length === 0 && profile.diets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('profile.noRestrictions')}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" onOpenAutoFocus={onOpenAutoFocus}>
          <form onSubmit={onSubmit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>
                {editing?.kind === 'add' ? t('dialog.addTitle') : t('dialog.editTitle')}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={nameId}>{t('fields.name')}</Label>
              <Input
                id={nameId}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t('fields.namePlaceholder')}
                aria-invalid={Boolean(fieldErrors.name)}
                ref={nameRef}
              />
              {fieldErrors.name?.[0] ? (
                <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>
              ) : null}
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-foreground">
                {t('fields.allergies')}
              </legend>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((a) => {
                  const checked = draft.allergens.includes(a);
                  return (
                    <label
                      key={a}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        checked
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setDraft((d) => ({
                            ...d,
                            allergens: toggle(d.allergens, a),
                          }))
                        }
                      />
                      {ALLERGEN_LABELS[a]}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-foreground">{t('fields.diets')}</legend>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAGS.map((tag) => {
                  const checked = draft.diets.includes(tag);
                  return (
                    <label
                      key={tag}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        checked
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setDraft((d) => ({
                            ...d,
                            diets: toggle(d.diets, tag),
                          }))
                        }
                      />
                      {DIETARY_TAG_LABELS[tag]}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {groups.length > 0 ? (
              <div className="grid gap-2">
                <Label htmlFor={groupSelectId}>{t('fields.familyGroup')}</Label>
                <NativeSelect
                  id={groupSelectId}
                  value={draft.groupId}
                  onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value }))}
                >
                  <option value="">{t('fields.justMe')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
                {fieldErrors.groupId?.[0] ? (
                  <p className="text-sm text-destructive">{fieldErrors.groupId[0]}</p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={isPending}
              >
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? t('actions.saving')
                  : editing?.kind === 'add'
                    ? t('actions.addMember')
                    : t('actions.saveChanges')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {targetsFor ? (
        <NutritionTargetsDialog
          profile={{ id: targetsFor.id, name: targetsFor.name }}
          entries={targetsFor.targets}
          open
          onOpenChange={(open) => !open && setTargetsFor(null)}
          onChanged={() => {
            setTargetsFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The targets in force today, with the date they started. The date is not
 * decoration: it is what tells a cook whether the numbers below are the ones a
 * past week was scored against or a change they made this morning.
 */
function TargetSummary({ profile }: { profile: MemberProfileView }) {
  const t = useTranslations('dietary');
  const current = selectEffectiveTarget(profile.targets, todayIso());
  if (!current)
    return <p className="text-sm text-muted-foreground">{t('profile.futureTargets')}</p>;

  const rows = targetRows(current.targets);
  if (rows.length === 0) return null;

  return (
    <div className="text-sm">
      <p className="text-muted-foreground">
        {rows
          .map((row) => `${row.label} ${formatNutrient(row.value, row.decimals)} ${row.unit}`)
          .join(' · ')}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('profile.targetSince', { date: current.effectiveFrom })}
      </p>
    </div>
  );
}
