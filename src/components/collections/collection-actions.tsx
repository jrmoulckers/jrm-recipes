'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';
import { useDialogInitialFocus } from '~/lib/use-initial-focus';
import { deleteCollectionAction, renameCollectionAction } from '~/server/collections/actions';
import { type CollectionInput } from '~/server/collections/validation';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { ImageUploadField } from '~/components/ui/image-upload';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { useConfirm } from '~/components/ui/confirm-dialog';

export function CollectionActions({
  collection,
}: {
  collection: {
    id: string;
    name: string;
    description: string | null;
    coverImageUrl: string | null;
  };
}) {
  const router = useRouter();
  const t = useTranslations('collections.actions');
  const nameId = React.useId();
  const { ref: nameRef, onOpenAutoFocus } = useDialogInitialFocus<HTMLInputElement>();
  const descriptionId = React.useId();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [name, setName] = React.useState(collection.name);
  const [description, setDescription] = React.useState(collection.description ?? '');
  const [coverImageUrl, setCoverImageUrl] = React.useState(collection.coverImageUrl ?? '');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [isPending, startTransition] = React.useTransition();
  const confirm = useConfirm();

  function onRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: CollectionInput = {
      name,
      description,
      coverImageUrl: coverImageUrl.trim() || undefined,
    };
    setFieldErrors({});

    startTransition(() => {
      void renameCollectionAction(collection.id, input).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toast.updated'));
        setRenameOpen(false);
        router.refresh();
      });
    });
  }

  async function onDelete() {
    // Yield a tick so the dropdown has finished closing and returned focus.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const ok = await confirm({
      title: t('confirm.delete.title', { name: collection.name }),
      description: t('confirm.delete.description'),
      confirmLabel: t('confirm.delete.confirmLabel'),
    });
    if (!ok) return;
    startTransition(() => {
      void deleteCollectionAction(collection.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toast.deleted'));
        router.push('/collections');
      });
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={t('a11y.options')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setName(collection.name);
              setDescription(collection.description ?? '');
              setCoverImageUrl(collection.coverImageUrl ?? '');
              setRenameOpen(true);
            }}
          >
            <Pencil /> {t('menu.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              // Let the menu close and hand focus back before the dialog traps
              // it. The old window.confirm blocked synchronously, so this
              // ordering did not matter.
              void onDelete();
            }}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 /> {t('menu.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
          <form onSubmit={onRename} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>{t('edit.title')}</DialogTitle>
              <DialogDescription>{t('edit.description')}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={nameId}>{t('edit.fields.name')}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
                ref={nameRef}
              />
              {fieldErrors.name?.[0] ? (
                <p id={`${nameId}-error`} className="text-sm text-destructive">
                  {fieldErrors.name[0]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={descriptionId}>{t('edit.fields.description')}</Label>
              <Textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? `${descriptionId}-error` : undefined}
              />
              {fieldErrors.description?.[0] ? (
                <p id={`${descriptionId}-error`} className="text-sm text-destructive">
                  {fieldErrors.description[0]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <ImageUploadField
                label={t('edit.fields.coverImage')}
                value={coverImageUrl}
                onChange={(url) => setCoverImageUrl(url)}
                folder="heirloom/collections"
                size="compact"
              />
              {fieldErrors.coverImageUrl?.[0] ? (
                <p className="text-sm text-destructive">{fieldErrors.coverImageUrl[0]}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
                disabled={isPending}
              >
                {t('edit.actions.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t('edit.actions.saving') : t('edit.actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
