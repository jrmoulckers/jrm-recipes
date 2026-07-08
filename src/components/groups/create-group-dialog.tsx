"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createGroupAction } from "~/server/groups/actions";
import { type GroupInput } from "~/server/groups/validation";
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

export function CreateGroupDialog({
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
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>(
    {},
  );
  const [isPending, startTransition] = React.useTransition();

  function resetForm() {
    setName("");
    setDescription("");
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
          toast.error(result.error);
          return;
        }

        toast.success("Your group is ready for the family table");
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
            <Plus /> New group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Create a family group</DialogTitle>
            <DialogDescription>
              Make a shared space for the recipes your people pass around.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={nameId}>Group name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sunday Supper Club"
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
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="For the recipes, notes, and weeknight saves we all share."
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
              {isPending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
