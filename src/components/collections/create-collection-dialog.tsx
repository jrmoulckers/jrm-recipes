'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';

import { createCollectionAction } from '~/server/collections/actions';
import { type CollectionInput } from '~/server/collections/validation';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';

export function CreateCollectionDialog({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslations('collections.create');
  const nameId = React.useId();
  const descriptionId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [isPending, startTransition] = React.useTransition();

  function resetForm() {
    setName('');
    setDescription('');
    setFieldErrors({});
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: CollectionInput = { name, description };
    setFieldErrors({});

    startTransition(() => {
      void createCollectionAction(input).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }

        toast.success(t('toast.created'));
        setOpen(false);
        resetForm();
        router.push(`/collections/${result.id}`);
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="lg">
            <Plus /> {t('trigger')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={nameId}>{t('fields.name.label')}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('fields.name.placeholder')}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
              autoFocus
            />
            {fieldErrors.name?.[0] ? (
              <p id={`${nameId}-error`} className="text-sm text-destructive">
                {fieldErrors.name[0]}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={descriptionId}>{t('fields.description.label')}</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('fields.description.placeholder')}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? `${descriptionId}-error` : undefined}
            />
            {fieldErrors.description?.[0] ? (
              <p id={`${descriptionId}-error`} className="text-sm text-destructive">
                {fieldErrors.description[0]}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('actions.creating') : t('actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
