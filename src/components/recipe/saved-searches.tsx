"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createSavedSearchAction,
  deleteSavedSearchAction,
} from "~/server/searches/actions";
import { type SavedSearch } from "~/server/searches/queries";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

/**
 * "Save this search" + a menu of saved searches. Saving stores the current
 * (already normalized) querystring under a name; applying just navigates back
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
  const router = useRouter();
  const pathname = usePathname();
  const nameId = React.useId();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [isPending, startTransition] = React.useTransition();

  function apply(query: string) {
    setListOpen(false);
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function onDelete(id: string) {
    startTransition(() => {
      void deleteSavedSearchAction(id).then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Saved search removed.");
        router.refresh();
      });
    });
  }

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);
    startTransition(() => {
      void createSavedSearchAction({ name, query: currentQuery }).then(
        (result) => {
          if (!result.ok) {
            setFieldError(result.fieldErrors?.name?.[0] ?? result.error);
            toast.error(result.error);
            return;
          }
          toast.success("Search saved.");
          setSaveOpen(false);
          setName("");
          router.refresh();
        },
      );
    });
  }

  return (
    <div className="flex items-end gap-2">
      {savedSearches.length > 0 && (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              <Bookmark /> Saved ({savedSearches.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Saved searches
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
                    aria-label={`Delete saved search ${saved.name}`}
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
          title={
            filtersActive ? undefined : "Add a filter or search term to save"
          }
          onClick={() => setSaveOpen(true)}
        >
          <BookmarkPlus /> Save search
        </Button>
        <DialogContent>
          <form onSubmit={onSave} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Save this search</DialogTitle>
              <DialogDescription>
                Name these filters to reapply them any time from the recipes
                page.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="30-minute vegetarian"
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
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save search"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
