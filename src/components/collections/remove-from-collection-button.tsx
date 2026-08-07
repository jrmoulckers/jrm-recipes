"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { removeRecipeFromCollectionAction } from "~/server/collections/actions";
import { cn } from "~/lib/utils";
import { CloseButton } from "~/components/ui/close-button";

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
  const t = useTranslations("collections.removeFromCollection");
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
        toast.success(t("toast.removed"));
        router.refresh();
      } else {
        toast.error(friendlyError(result.error));
      }
    });
  }

  return (
    <CloseButton
      variant="overlay"
      size="lg"
      tone="danger"
      onClick={onRemove}
      disabled={pending}
      label={t("a11y.remove")}
      className={cn(pending && "cursor-wait", className)}
    >
      {pending ? <Loader2 className="animate-spin" /> : undefined}
    </CloseButton>
  );
}
