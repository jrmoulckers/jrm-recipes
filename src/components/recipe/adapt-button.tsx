'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ChefHat, GitFork, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createAdaptationAction } from '~/server/recipes/actions';
import { recipeEditPath } from '~/lib/recipe-path';
import { useServerAction } from '~/lib/use-server-action';
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
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';

export function AdaptButton({
  sourceId,
  sourceTitle,
  canAdapt,
}: {
  sourceId: string;
  sourceTitle: string;
  canAdapt: boolean;
}) {
  const t = useTranslations('recipe');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const adapt = useServerAction(createAdaptationAction, {
    successToast: t('adapt.toast.created'),
    errorToast: true,
    onSuccess: (result) => {
      setOpen(false);
      router.push(recipeEditPath(result));
    },
  });
  const pending = adapt.pending;

  function onSignedOutClick() {
    toast(t('adapt.toast.signIn'));
  }

  function onAdapt() {
    const trimmed = note.trim();
    adapt.run(sourceId, trimmed.length > 0 ? trimmed : undefined);
  }

  if (!canAdapt) {
    return (
      <Button type="button" variant="outline" onClick={onSignedOutClick}>
        <GitFork /> {t('adapt.trigger')}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <GitFork /> {t('adapt.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ChefHat className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>{t('adapt.title')}</DialogTitle>
          <DialogDescription>{t('adapt.description', { title: sourceTitle })}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="fork-note">{t('adapt.noteLabel')}</Label>
          <Textarea
            id="fork-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder={t('adapt.notePlaceholder')}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">{t('adapt.noteHint')}</p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button type="button" onClick={onAdapt} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <GitFork />}
            {pending ? t('adapt.creating') : t('adapt.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
