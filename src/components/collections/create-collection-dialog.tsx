"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { createCollectionAction } from "~/server/collections/actions";
import { type CollectionInput } from "~/server/collections/validation";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export function CreateCollectionDialog({
  children,
}: {
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const nameId = React.useId();
  const descriptionId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [isPending, startTransition] = React.useTransition();

  function resetForm() {
    setName("");
    setDescription("");
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

        toast.success("Collection created");
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
            <Plus /> New collection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Create a collection</DialogTitle>
            <DialogDescription>
              Group the recipes you love into a cookbook — weeknight dinners,
              holiday bakes, or the dishes you always come back to.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weeknight Winners"
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
              placeholder="Fast, reliable dinners the whole family eats."
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
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create collection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
