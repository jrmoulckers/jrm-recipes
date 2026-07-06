"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { toggleFavoriteAction } from "~/server/collections/actions";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

type FavoriteButtonProps = {
  recipeId: string;
  recipeSlug?: string;
  initialFavorited?: boolean;
  /** `icon` is a compact overlay for cards; `button` is a labelled action. */
  variant?: "icon" | "button";
  /** When false, the button nudges the visitor to sign in instead of saving. */
  canFavorite?: boolean;
  className?: string;
};

export function FavoriteButton({
  recipeId,
  recipeSlug,
  initialFavorited = false,
  variant = "icon",
  canFavorite = true,
  className,
}: FavoriteButtonProps) {
  const router = useRouter();
  const [favorited, setFavorited] = React.useState(initialFavorited);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setFavorited(initialFavorited);
  }, [initialFavorited]);

  function onToggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;

    if (!canFavorite) {
      toast("Sign in to save recipes to your collections.");
      return;
    }

    const previous = favorited;
    const next = !favorited;
    setFavorited(next);

    startTransition(async () => {
      const result = await toggleFavoriteAction({ recipeId, recipeSlug });
      if (result.ok) {
        setFavorited(result.favorited);
        toast.success(result.favorited ? "Saved to favorites." : "Removed from favorites.");
        router.refresh();
      } else {
        setFavorited(previous);
        toast.error(result.error);
      }
    });
  }

  const label = favorited ? "Saved to favorites" : "Save to favorites";

  if (variant === "button") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={favorited}
        className={className}
      >
        <Heart
          className={cn(
            "transition-colors",
            favorited && "fill-primary text-primary",
          )}
        />
        {favorited ? "Saved" : "Save"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-token backdrop-blur transition-[color,transform] duration-150 hover:scale-105 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
        favorited && "text-primary",
        pending && "cursor-wait",
        className,
      )}
    >
      <Heart className={cn("size-5", favorited && "fill-primary text-primary")} />
    </button>
  );
}
