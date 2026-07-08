"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  deleteCollectionAction,
  renameCollectionAction,
} from "~/server/collections/actions";
import { type CollectionInput } from "~/server/collections/validation";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

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
  const nameId = React.useId();
  const descriptionId = React.useId();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [name, setName] = React.useState(collection.name);
  const [description, setDescription] = React.useState(
    collection.description ?? "",
  );
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [isPending, startTransition] = React.useTransition();

  function onRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: CollectionInput = {
      name,
      description,
      coverImageUrl: collection.coverImageUrl ?? undefined,
    };
    setFieldErrors({});

    startTransition(() => {
      void renameCollectionAction(collection.id, input).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success("Collection updated");
        setRenameOpen(false);
        router.refresh();
      });
    });
  }

  function onDelete() {
    const ok = window.confirm(
      `Delete “${collection.name}”? Your recipes stay in your library — only this collection is removed.`,
    );
    if (!ok) return;
    startTransition(() => {
      void deleteCollectionAction(collection.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success("Collection deleted");
        router.push("/collections");
      });
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Collection options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setName(collection.name);
              setDescription(collection.description ?? "");
              setRenameOpen(true);
            }}
          >
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onDelete();
            }}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={onRename} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Edit collection</DialogTitle>
              <DialogDescription>
                Rename this collection or update its description.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={
                  fieldErrors.name ? `${nameId}-error` : undefined
                }
                autoFocus
              />
              {fieldErrors.name?.[0] ? (
                <p id={`${nameId}-error`} className="text-sm text-destructive">
                  {fieldErrors.name[0]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={descriptionId}>Description</Label>
              <Textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={
                  fieldErrors.description ? `${descriptionId}-error` : undefined
                }
              />
              {fieldErrors.description?.[0] ? (
                <p
                  id={`${descriptionId}-error`}
                  className="text-sm text-destructive"
                >
                  {fieldErrors.description[0]}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
