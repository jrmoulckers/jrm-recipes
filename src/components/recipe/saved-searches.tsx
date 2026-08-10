'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';

import { createSavedSearchAction, deleteSavedSearchAction } from '~/server/searches/actions';
import { type SavedSearch } from '~/server/searches/queries';
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
import { pathnameWithQuery } from '~/lib/routes';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';

/**
 * "Save this search" + a menu of saved searches. Saving stores the current
 * (already normalized) querystring under a name. Applying just navigates back
 * to those params. State lives on the server, so we `router.refresh()` after
 * mutations to pull the fresh list.
 */
export function SavedSearches({
  savedSearches,
  currentQuery,
  filtersActive,
}: {
  savedSearches: SavedSearch[];
  currentQuery: string;
  filtersActive: boolean;
}) {
  const t = useTranslations('recipe');
  const router = useRouter();
  const pathname = usePathname();
  const nameId = React.useId();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [isPending, startTransition] = React.useTransition();

  function apply(query: string) {
    setListOpen(false);
    router.push(pathnameWithQuery(pathname, query), { scroll: false });
  }

  function onDelete(id: string) {
    startTransition(() => {
      void deleteSavedSearchAction(id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('savedSearches.toast.removed'));
        router.refresh();
      });
    });
  }

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);
    startTransition(() => {
      void createSavedSearchAction({ name, query: currentQuery }).then((result) => {
        if (!result.ok) {
          setFieldError(result.fieldErrors?.name?.[0] ?? result.error);
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('savedSearches.toast.saved'));
        setSaveOpen(false);
        setName('');
        router.refresh();
      });
    });
  }

  return (
    <div className="flex items-end gap-2">
      {savedSearches.length > 0 && (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              <Bookmark /> {t('savedSearches.saved', { count: savedSearches.length })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t('savedSearches.listTitle')}
            </p>
            <ul className="grid gap-0.5">
              {savedSearches.map((saved) => (
                <li key={saved.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => apply(saved.query)}
                    className="flex-1 truncate rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted"
                  >
                    {saved.name}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('savedSearches.deleteAria', {
                      name: saved.name,
                    })}
                    disabled={isPending}
                    onClick={() => onDelete(saved.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <Button
          type="button"
          variant="outline"
          disabled={!filtersActive}
          title={filtersActive ? undefined : t('savedSearches.disabledTitle')}
          onClick={() => setSaveOpen(true)}
        >
          <BookmarkPlus /> {t('savedSearches.trigger')}
        </Button>
        <DialogContent>
          <form onSubmit={onSave} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>{t('savedSearches.title')}</DialogTitle>
              <DialogDescription>{t('savedSearches.description')}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={nameId}>{t('savedSearches.nameLabel')}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('savedSearches.namePlaceholder')}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? `${nameId}-error` : undefined}
                autoFocus
              />
              {fieldError ? (
                <p id={`${nameId}-error`} className="text-sm text-destructive">
                  {fieldError}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveOpen(false)}
                disabled={isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t('common.saving') : t('savedSearches.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
