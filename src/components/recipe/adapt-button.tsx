"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChefHat, GitFork, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createAdaptationAction } from "~/server/recipes/actions";
import { recipeDetailPath } from "~/lib/recipe-path";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export function AdaptButton({
  sourceId,
  sourceTitle,
  canAdapt,
}: {
  sourceId: string;
  sourceTitle: string;
  canAdapt: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function onSignedOutClick() {
    toast("Sign in to adapt this recipe");
  }

  function onAdapt() {
    startTransition(async () => {
      const trimmed = note.trim();
      const result = await createAdaptationAction(
        sourceId,
        trimmed.length > 0 ? trimmed : undefined,
      );
      if (result.ok) {
        toast.success("Adaptation created");
        setOpen(false);
        router.push(`${recipeDetailPath(result)}/edit`);
        return;
      }
      toast.error(result.error);
    });
  }

  if (!canAdapt) {
    return (
      <Button type="button" variant="outline" onClick={onSignedOutClick}>
        <GitFork /> Adapt
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <GitFork /> Adapt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ChefHat className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Create your own adaptation</DialogTitle>
          <DialogDescription>
            Create your own adaptation of {sourceTitle}. You&apos;ll get an
            editable copy; the original stays untouched and we&apos;ll remember
            it came from here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="fork-note">What are you changing?</Label>
          <Textarea
            id="fork-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="A little less sugar, gluten-free flour, or the weeknight shortcut…"
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Optional. This note helps your family see what inspired the fork.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onAdapt} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <GitFork />}
            {pending ? "Creating…" : "Create adaptation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
