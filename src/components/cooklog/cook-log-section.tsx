'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CookingPot, Loader2, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';

import { deleteCookLogAction, logCookAction } from '~/server/cooklog/actions';
import type { CookLogItem } from '~/server/cooklog/queries';
import { formatDate, formatRelativeTime } from '~/lib/dates';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
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
import { ImageUploadField } from '~/components/ui/image-upload';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { CharacterCounter } from '~/components/ui/character-counter';
import { useConfirm } from '~/components/ui/confirm-dialog';
import { COOK_NOTE_MAX_LENGTH, COOK_NOTE_TOO_LONG_MESSAGE } from '~/server/cooklog/validation';
import { ReactionBar } from '~/components/engagement/reaction-bar';
import type { ReactionCount, ReactionEmojiKey } from '~/lib/reactions';

/** Per-entry reaction tally passed from the server (#342). */
export type EntryReactions = {
  counts: ReactionCount[];
  reactors: Partial<Record<ReactionEmojiKey, string[]>>;
};

export function CookLogSection({
  recipeId,
  recipeSlug,
  recipeTitle,
  entries,
  cookCount,
  canLog,
  canReact = false,
  reactionsByEntry = {},
  shareGroup = null,
  dbConfigured,
}: {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  entries: CookLogItem[];
  cookCount: number;
  canLog: boolean;
  canReact?: boolean;
  reactionsByEntry?: Record<string, EntryReactions>;
  shareGroup?: { id: string; name: string } | null;
  dbConfigured: boolean;
}) {
  const t = useTranslations('cookLog.section');
  if (!dbConfigured) {
    return (
      <section
        className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
        aria-label={t('a11y.journal')}
      >
        <div className="flex items-center gap-2">
          <CookingPot className="size-4" aria-hidden="true" />
          {t('databaseConnect.before')}{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">DATABASE_URL</code>{' '}
          {t('databaseConnect.after')} <code className="font-mono text-xs">.env.example</code>
          {t('databaseConnect.end')}
        </div>
      </section>
    );
  }

  // Recency nudge (#368): with prior cooks, surface "last made … · N times" and a
  // one-tap re-log. Entries arrive newest-first, so entries[0] is the last cook.
  const lastEntry = entries[0] ?? null;
  const lastCookedAt = lastEntry ? new Date(lastEntry.cookedAt) : null;
  const lastServings = lastEntry?.servingsMade ?? null;

  return (
    <section
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-token sm:p-6"
      aria-label={t('a11y.journalForRecipe', { title: recipeTitle })}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CookingPot className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">{t('heading')}</h2>
            <p className="text-sm text-muted-foreground">
              {cookCount > 0 ? t('summary.withCooks', { count: cookCount }) : t('summary.empty')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {cookCount > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              <CookingPot className="size-3.5" aria-hidden="true" />
              {t('cookedTimes', { count: cookCount })}
            </Badge>
          )}
          <LogCookButton
            recipeId={recipeId}
            recipeSlug={recipeSlug}
            recipeTitle={recipeTitle}
            canLog={canLog}
            shareGroup={shareGroup}
          />
        </div>
      </div>

      {canLog && cookCount > 0 && lastCookedAt && (
        <LogAgainNudge
          recipeId={recipeId}
          recipeSlug={recipeSlug}
          lastCookedAt={lastCookedAt}
          cookCount={cookCount}
          lastServings={lastServings}
        />
      )}

      {entries.length > 0 ? (
        <CookLogTimeline
          entries={entries}
          recipeSlug={recipeSlug}
          canReact={canReact}
          reactionsByEntry={reactionsByEntry}
        />
      ) : (
        <EmptyCookLog />
      )}
    </section>
  );
}

function EmptyCookLog() {
  const t = useTranslations('cookLog.section');
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UtensilsCrossed className="size-6" aria-hidden="true" />
      </span>
      <p className="font-medium">{t('empty.heading')}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t('empty.body')}</p>
    </div>
  );
}

/**
 * "Made it again?" recency nudge (#368). Shown when the viewer has cooked this
 * recipe before: surfaces how long ago and how many times, plus a one-tap
 * "Log again" that records a fresh cook (dated now, servings prefilled from the
 * last entry) via the existing {@link logCookAction}. Reuses the cook-log data
 * already on the page, so no extra queries. Notes/photos remain available
 * through the full "I cooked this" dialog.
 */
function LogAgainNudge({
  recipeId,
  recipeSlug,
  lastCookedAt,
  cookCount,
  lastServings,
}: {
  recipeId: string;
  recipeSlug: string;
  lastCookedAt: Date;
  cookCount: number;
  lastServings: number | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('cookLog.section');
  const [pending, startTransition] = React.useTransition();
  const valid = !Number.isNaN(lastCookedAt.getTime());

  function onLogAgain() {
    if (pending) return;
    startTransition(async () => {
      const result = await logCookAction({
        recipeId,
        recipeSlug,
        servingsMade: lastServings ?? undefined,
      });
      if (result.ok) {
        toast.success(t('toast.loggedAgain', { count: cookCount + 1 }));
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t('logAgain.question')}</span>{' '}
        {valid
          ? t('logAgain.lastMade', {
              time: formatRelativeTime(lastCookedAt, locale),
            })
          : t('logAgain.madeBefore')}
        {' · '}
        {t('cookedTimesLower', { count: cookCount })}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onLogAgain} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CookingPot className="size-4" />}
        {pending ? t('logging') : t('logAgain.button')}
      </Button>
    </div>
  );
}

function CookLogTimeline({
  entries,
  recipeSlug,
  canReact,
  reactionsByEntry,
}: {
  entries: CookLogItem[];
  recipeSlug: string;
  canReact: boolean;
  reactionsByEntry: Record<string, EntryReactions>;
}) {
  const locale = useLocale();
  const t = useTranslations('cookLog.section');
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-3 before:start-[1.15rem] before:top-3 before:w-px before:bg-border">
      {entries.map((entry) => {
        const cookedAt = new Date(entry.cookedAt);
        const valid = !Number.isNaN(cookedAt.getTime());
        const servingsCount =
          entry.servingsMade == null || !Number.isFinite(entry.servingsMade)
            ? 0
            : Math.max(0, Math.floor(entry.servingsMade));
        const servings = servingsCount > 0 ? t('servings', { count: servingsCount }) : null;

        return (
          <li key={entry.id} className="relative flex gap-4">
            <div
              className="relative z-10 mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
              aria-hidden="true"
            >
              <CookingPot className="size-4" />
            </div>

            <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">
                    {valid ? formatDate(cookedAt, 'PPP', locale) : t('loggedEarlier')}
                  </p>
                  {valid && (
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(cookedAt, locale)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {servings && (
                    <Badge variant="muted" className="gap-1">
                      <UtensilsCrossed className="size-3" aria-hidden="true" />
                      {servings}
                    </Badge>
                  )}
                  <DeleteCookButton entryId={entry.id} recipeSlug={recipeSlug} />
                </div>
              </div>

              {entry.note && (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {entry.note}
                </p>
              )}

              {entry.photoUrl && (
                <figure className="mt-3 overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- cook photos may be arbitrary user-pasted URLs (Cloudinary optional) that can't be pre-allowlisted for next/image */}
                  <img
                    src={entry.photoUrl}
                    alt={t('photoAlt', {
                      date: valid ? formatDate(cookedAt, 'PPP', locale) : t('earlierDate'),
                    })}
                    className="max-h-72 w-full object-cover"
                  />
                </figure>
              )}

              <div className="mt-3">
                <ReactionBar
                  targetType="cook_log"
                  targetId={entry.id}
                  recipeSlug={recipeSlug}
                  initialCounts={reactionsByEntry[entry.id]?.counts ?? []}
                  initialReactors={reactionsByEntry[entry.id]?.reactors ?? {}}
                  canReact={canReact}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LogCookButton({
  recipeId,
  recipeSlug,
  recipeTitle,
  canLog,
  shareGroup = null,
}: {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  canLog: boolean;
  shareGroup?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const t = useTranslations('cookLog.section');
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [photoUrl, setPhotoUrl] = React.useState('');
  const [servingsMade, setServingsMade] = React.useState('');
  const [shareWithFamily, setShareWithFamily] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setNote('');
    setPhotoUrl('');
    setServingsMade('');
    setShareWithFamily(false);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await logCookAction({
        recipeId,
        recipeSlug,
        note,
        photoUrl,
        servingsMade,
        shareWithFamily: shareGroup ? shareWithFamily : undefined,
      });
      if (result.ok) {
        toast.success(
          shareGroup && shareWithFamily
            ? t('toast.loggedAndShared', { group: shareGroup.name })
            : t('toast.loggedToJournal'),
        );
        reset();
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  if (!canLog) {
    return (
      <Button type="button" onClick={() => toast(t('toast.signInToLog'))}>
        <CookingPot /> {t('button.iCookedThis')}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button">
          <CookingPot /> {t('button.iCookedThis')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CookingPot className="size-5" aria-hidden="true" />
            </div>
            <DialogTitle>{t('dialog.title')}</DialogTitle>
            <DialogDescription>{t('dialog.description', { title: recipeTitle })}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="cook-note">{t('dialog.noteLabel')}</Label>
            <Textarea
              id="cook-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('dialog.notePlaceholder')}
              disabled={pending}
            />
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t('dialog.noteHelper')}</p>
              <CharacterCounter
                value={note.length}
                max={COOK_NOTE_MAX_LENGTH}
                overMessage={COOK_NOTE_TOO_LONG_MESSAGE}
              />
            </div>
          </div>

          <ImageUploadField
            value={photoUrl}
            onChange={setPhotoUrl}
            label={t('dialog.photoLabel')}
            folder="heirloom/cooks"
            size="compact"
            hint={t('dialog.photoHint')}
          />

          <div className="grid gap-2">
            <Label htmlFor="cook-servings">{t('dialog.servingsLabel')}</Label>
            <Input
              id="cook-servings"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              value={servingsMade}
              onChange={(event) => setServingsMade(event.target.value)}
              placeholder={t('dialog.servingsPlaceholder')}
              disabled={pending}
              className="max-w-32"
            />
          </div>

          {shareGroup && (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="cook-share" className="cursor-pointer">
                  {t('dialog.shareLabel')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('dialog.shareDescription', { group: shareGroup.name })}
                </p>
              </div>
              <Switch
                id="cook-share"
                checked={shareWithFamily}
                onCheckedChange={setShareWithFamily}
                disabled={pending}
                aria-label={t('a11y.shareWithGroup', {
                  group: shareGroup.name,
                })}
              />
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              {pending ? t('saving') : t('dialog.addToJournal')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCookButton({ entryId, recipeSlug }: { entryId: string; recipeSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const confirm = useConfirm();
  const t = useTranslations('cookLog.section');

  async function onDelete() {
    const ok = await confirm({
      title: t('confirmDelete.title'),
      description: t('confirmDelete.description'),
      confirmLabel: t('confirmDelete.confirmLabel'),
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteCookLogAction({ entryId, recipeSlug });
      if (result.ok) {
        toast.success(t('toast.removedFromJournal'));
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-destructive"
      onClick={onDelete}
      disabled={pending}
      aria-label={t('a11y.deleteEntry')}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  );
}
