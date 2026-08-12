'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';
import { useDialogInitialFocus } from '~/lib/use-initial-focus';
import { createGroupAction } from '~/server/groups/actions';
import { type GroupInput } from '~/server/groups/validation';
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
import { Textarea } from '~/components/ui/textarea';
import { FormField } from '~/components/ui/form-field';

export function CreateGroupDialog({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslations('groups.create');
  const nameId = React.useId();
  const descriptionId = React.useId();
  const { ref: nameRef, onOpenAutoFocus } = useDialogInitialFocus<HTMLInputElement>();
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
    const input: GroupInput = { name, description };
    setFieldErrors({});

    startTransition(() => {
      void createGroupAction(input).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }

        toast.success(t('toast.created'));
        setOpen(false);
        resetForm();
        if (result.slug) router.push(`/groups/${result.slug}`);
        else router.refresh();
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
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <FormField label={t('fields.name.label')} htmlFor={nameId} error={fieldErrors.name}>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('fields.name.placeholder')}
              ref={nameRef}
            />
          </FormField>

          <FormField
            label={t('fields.description.label')}
            htmlFor={descriptionId}
            error={fieldErrors.description}
          >
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('fields.description.placeholder')}
            />
          </FormField>

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
