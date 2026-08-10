'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, History, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';

import { cn } from '~/lib/utils';
import { formatRelativeTime } from '~/lib/dates';
import { revertRecipeAction } from '~/server/recipes/actions';
import type { VersionListItem } from '~/server/recipes/queries';
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

export function RecipeTimeline({
  versions,
  recipeSlug,
  recipeId,
  canRevert,
}: {
  versions: VersionListItem[];
  recipeSlug: string;
  recipeId: string;
  canRevert: boolean;
}) {
  const latestVersion = versions[0]?.versionNumber;
  const locale = useLocale();
  const t = useTranslations('recipe');

  if (versions.length === 0) {
    return (
      <section
        className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground"
        aria-label={t('timeline.aria', { title: recipeSlug })}
      >
        <div className="flex items-center gap-2 font-medium text-foreground">
          <History className="size-4" aria-hidden="true" />
          {t('timeline.emptyTitle')}
        </div>
        <p className="mt-1">{t('timeline.emptyBody')}</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 shadow-token"
      aria-label={t('timeline.aria', { title: recipeSlug })}
    >
      <div className="mb-5 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">{t('timeline.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('timeline.description')}</p>
        </div>
      </div>

      <ol className="relative space-y-4 before:absolute before:bottom-3 before:start-5 before:top-3 before:w-px before:bg-border">
        {versions.map((version) => {
          const isLatest = version.versionNumber === latestVersion;
          const canRestore = canRevert && !isLatest && versions.length > 1;
          const author = version.author?.name ?? version.author?.handle ?? t('timeline.familyCook');
          const createdAt = new Date(version.createdAt);
          const label =
            version.label ??
            (version.versionNumber === 1 ? t('timeline.created') : t('timeline.updated'));

          return (
            <li key={version.id} className="relative flex gap-4">
              <div
                className={cn(
                  'relative z-10 mt-1 flex size-10 shrink-0 items-center justify-center rounded-full border bg-card',
                  isLatest
                    ? 'border-primary bg-primary text-primary-foreground shadow-token'
                    : 'border-border text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {isLatest ? <History className="size-4" /> : <Clock className="size-4" />}
              </div>

              <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('timeline.version', {
                        version: version.versionNumber,
                      })}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-semibold leading-tight">
                      {label}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {author} ·{' '}
                      {Number.isNaN(createdAt.getTime())
                        ? t('timeline.savedEarlier')
                        : formatRelativeTime(createdAt, locale)}
                    </p>
                    {version.summary && (
                      <p className="mt-3 text-sm text-muted-foreground">{version.summary}</p>
                    )}
                  </div>

                  {canRestore && (
                    <RestoreVersionButton
                      recipeId={recipeId}
                      versionNumber={version.versionNumber}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RestoreVersionButton({
  recipeId,
  versionNumber,
}: {
  recipeId: string;
  versionNumber: number;
}) {
  const t = useTranslations('recipe');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function onRestore() {
    startTransition(async () => {
      const result = await revertRecipeAction(recipeId, versionNumber);
      if (result.ok) {
        toast.success(t('timeline.toast.restored', { version: versionNumber }));
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <RotateCcw /> {t('timeline.restore')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('timeline.restoreTitle')}</DialogTitle>
          <DialogDescription>{t('timeline.restoreDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button type="button" onClick={onRestore} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {pending
              ? t('timeline.restoring')
              : t('timeline.restoreVersion', { version: versionNumber })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
