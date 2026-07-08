"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { deleteRecipeAction } from "~/server/recipes/actions";

export function DeleteRecipeButton({ id }: { id: string }) {
  const [pending, startTransition] = React.useTransition();

  function onDelete() {
    const ok = window.confirm(
      "Delete this recipe? This permanently removes it and its steps, photos, and history. This can't be undone.",
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteRecipeAction(id);
      } catch {
        toast.error("Couldn't delete the recipe. Please try again.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      disabled={pending}
      onClick={onDelete}
    >
      <Trash2 /> {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
