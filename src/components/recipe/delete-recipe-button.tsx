"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { recipeDetailPath } from "~/lib/recipe-path";
import {
  deleteRecipeAction,
  restoreRecipeAction,
} from "~/server/recipes/actions";

/**
 * Owner-only delete with a grace-period undo (issue #427).
 *
 * Deletes are soft (issue #165) and {@link restoreRecipeAction} already brings a
 * recipe and its history back, so long-time users no longer risk losing decades
 * of family history to a mis-tap. We surface an "Undo" toast the moment the
 * delete is confirmed — the toast lives in the root-layout `Toaster`, so it
 * survives the server action's redirect to `/recipes` and stays actionable.
 */
export function DeleteRecipeButton({
  id,
  slug,
  title,
}: {
  id: string;
  slug: string | null;
  title?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onUndo() {
    void (async () => {
      const ok = await restoreRecipeAction(id);
      if (ok) {
        router.push(recipeDetailPath({ id, slug }));
        router.refresh();
        toast.success("Recipe restored.");
      } else {
        toast.error("Couldn't restore the recipe. Please try again.");
      }
    })();
  }

  function onDelete() {
    const label = title ? `“${title}”` : "this recipe";
    const ok = window.confirm(
      `Delete ${label}? Its steps, photos, and history are kept so you can undo this right after.`,
    );
    if (!ok) return;

    // Show the undo affordance optimistically: the soft-delete is immediate and
    // the action redirects us away, so a post-await toast could be lost. On a
    // genuine failure we dismiss it below and surface the error instead.
    const toastId = toast("Recipe deleted.", {
      description: "Changed your mind?",
      action: { label: "Undo", onClick: onUndo },
      duration: 10_000,
    });

    startTransition(async () => {
      try {
        await deleteRecipeAction(id);
      } catch {
        toast.dismiss(toastId);
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
