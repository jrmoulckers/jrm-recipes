"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { toggleFavoriteAction } from "~/server/collections/actions";
import { cn } from "~/lib/utils";
import { useReducedMotion } from "~/lib/use-reduced-motion";
import { useServerAction } from "~/lib/use-server-action";
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
  const [favorited, setFavorited] = React.useState(initialFavorited);
  // Snapshot of the pre-click state so a failed toggle can roll the icon back.
  const previousRef = React.useRef(initialFavorited);
  const reducedMotion = useReducedMotion();
  // Bumped only when the user favorites (never on mount, prop-sync, or
  // un-favorite), which remounts the glyph so the pop/burst replays once.
  const [burstKey, setBurstKey] = React.useState(0);
  const toggle = useServerAction(toggleFavoriteAction, {
    onSuccess: (result) => setFavorited(result.favorited),
    onError: () => setFavorited(previousRef.current),
    successToast: (result) =>
      result.favorited ? "Saved to favorites." : "Removed from favorites.",
    errorToast: true,
    refresh: true,
  });
  const pending = toggle.pending;

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

    const next = !favorited;
    previousRef.current = favorited;
    setFavorited(next);
    if (next && !reducedMotion) {
      setBurstKey((key) => key + 1);
    }
    toggle.run({ recipeId, recipeSlug });
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
        <HeartGlyph favorited={favorited} burstKey={burstKey} />
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
      <HeartGlyph favorited={favorited} burstKey={burstKey} iconClassName="size-5" />
    </button>
  );
}

/**
 * The heart icon plus a one-shot radiating ring. `burstKey` is the retrigger
 * handle: while it's 0 nothing animates (safe on first render / already-saved),
 * and each increment remounts the glyph so the heartbeat pop + burst play once.
 */
function HeartGlyph({
  favorited,
  burstKey,
  iconClassName,
}: {
  favorited: boolean;
  burstKey: number;
  iconClassName?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      {burstKey > 0 && (
        <span
          key={burstKey}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
        >
          <span className="size-full rounded-full border border-primary/70 motion-safe:animate-heart-burst" />
        </span>
      )}
      <Heart
        key={`heart-${burstKey}`}
        className={cn(
          "relative z-10 transition-colors",
          favorited && "fill-primary text-primary",
          burstKey > 0 && "motion-safe:animate-heart-pop",
          iconClassName,
        )}
      />
    </span>
  );
}