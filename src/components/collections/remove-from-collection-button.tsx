"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { removeRecipeFromCollectionAction } from "~/server/collections/actions";
import { cn } from "~/lib/utils";

export function RemoveFromCollectionButton({
  collectionId,
  recipeId,
  className,
}: {
  collectionId: string;
  recipeId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onRemove(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;

    startTransition(async () => {
      const result = await removeRecipeFromCollectionAction({
        collectionId,
        recipeId,
      });
      if (result.ok) {
        toast.success("Removed from collection");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={pending}
      aria-label="Remove from collection"
      title="Remove from collection"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-token backdrop-blur transition-[color,transform] duration-150 hover:scale-105 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
        pending && "cursor-wait",
        className,
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <X className="size-5" />
      )}
    </button>
  );
}
