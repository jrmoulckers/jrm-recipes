"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { createRecipeAction } from "~/server/recipes/actions";
import { type RecipeInput } from "~/server/recipes/validation";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { ImageUploadField } from "~/components/ui/image-upload";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

type SavedDraft = { id: string; slug: string | null };

/**
 * Quick-capture flow (#389): title + optional photo + one freeform box, saved
 * as a `draft` recipe so a busy parent can jot a recipe in under a minute and
 * finish it later. Reuses the existing `createRecipeAction` / `recipeInput`
 * contract (which rejects an empty title); the freeform text is preserved in
 * the recipe's notes so nothing is lost before the full editor is opened.
 */
export function QuickCaptureDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [photo, setPhoto] = React.useState("");
  const [freeform, setFreeform] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<SavedDraft | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setTitle("");
    setPhoto("");
    setFreeform("");
    setError(null);
    setSaved(null);
  }

  function onOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (title.trim().length === 0) {
      setError("Give your recipe a title.");
      return;
    }
    setError(null);

    const input: RecipeInput = {
      title: title.trim(),
      notes: freeform.trim().length > 0 ? freeform.trim() : undefined,
      coverImageUrl: photo.trim().length > 0 ? photo.trim() : undefined,
      visibility: "private",
      status: "draft",
      ingredients: [],
      steps: [],
      tags: [],
      equipment: [],
      dietaryFlags: [],
    };

    startTransition(async () => {
      const result = await createRecipeAction(input);
      if (result.ok) {
        setSaved({ id: result.id, slug: result.slug });
        toast.success("Draft saved. Finish it whenever you like.");
        router.refresh();
      } else {
        setError(result.error);
        toast.error(friendlyError(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline">
          <Sparkles /> Quick add
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        {saved ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <DialogTitle>Saved as a draft</DialogTitle>
              <DialogDescription>
                Captured. Open the full editor to add ingredients, steps and
                photos — or come back to it later from your cookbook.
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="sm:flex-1">
                <Link href={`/recipes/${saved.slug ?? saved.id}/edit`}>
                  <PencilLine /> Finish in full editor
                </Link>
              </Button>
              <Button variant="outline" onClick={reset} className="sm:flex-1">
                Add another
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <DialogTitle>Quick add a recipe</DialogTitle>
              <DialogDescription>
                Just a title to start. Dump the ingredients and steps as plain
                text — you can tidy it up later.
              </DialogDescription>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-title">Title</Label>
              <Input
                id="quick-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Grandma's meatballs"
                autoFocus
                maxLength={200}
                aria-required
              />
            </div>

            <ImageUploadField
              label="Photo (optional)"
              value={photo}
              onChange={setPhoto}
              size="compact"
              folder="heirloom/quick"
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-notes">Ingredients &amp; steps (optional)</Label>
              <Textarea
                id="quick-notes"
                value={freeform}
                onChange={(event) => setFreeform(event.target.value)}
                placeholder={"Paste or type anything — e.g.\n1 lb beef\n1 egg\n\nMix, roll, bake at 400."}
                rows={6}
                maxLength={4000}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
