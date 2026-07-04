"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";

import {
  removeRatingAction,
  setRatingAction,
} from "~/server/engagement/actions";
import { cn } from "~/lib/utils";

type RatingSummary = { average: number; count: number };

function ratingLabel(count: number) {
  return `${count} ${count === 1 ? "rating" : "ratings"}`;
}

function updateSummary(
  summary: RatingSummary,
  previous: number | null,
  next: number | null,
): RatingSummary {
  if (previous === next) return summary;
  let count = summary.count;
  let total = summary.average * summary.count;

  if (previous != null) {
    total -= previous;
    count -= 1;
  }
  if (next != null) {
    total += next;
    count += 1;
  }

  return {
    count: Math.max(0, count),
    average: count > 0 ? Math.round((total / count) * 10) / 10 : 0,
  };
}

export function RatingControl(props: {
  recipeId: string;
  recipeSlug: string;
  summary: { average: number; count: number };
  viewerRating: number | null;
  canRate: boolean;
}) {
  const { recipeId, recipeSlug, canRate } = props;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);
  const [viewerRating, setViewerRating] = React.useState(props.viewerRating);
  const [summary, setSummary] = React.useState(props.summary);

  React.useEffect(() => {
    setViewerRating(props.viewerRating);
    setSummary(props.summary);
    // Re-sync from the server snapshot only when the underlying values change,
    // not on every parent render (summary is a fresh object literal each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.summary.average, props.summary.count, props.viewerRating]);

  const displayRating =
    hoverRating ?? viewerRating ?? (!canRate ? Math.round(summary.average) : 0);

  function chooseRating(value: number) {
    if (!canRate || pending) return;

    const nextRating = viewerRating === value ? null : value;
    const previousRating = viewerRating;
    const previousSummary = summary;
    const nextSummary = updateSummary(summary, previousRating, nextRating);

    setViewerRating(nextRating);
    setSummary(nextSummary);
    setHoverRating(nextRating);

    startTransition(async () => {
      const result =
        nextRating == null
          ? await removeRatingAction({ recipeId, recipeSlug })
          : await setRatingAction({ recipeId, recipeSlug, value: nextRating });

      if (result.ok) {
        toast.success(nextRating == null ? "Rating cleared." : "Rating saved.");
        router.refresh();
      } else {
        setViewerRating(previousRating);
        setSummary(previousSummary);
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-token">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {summary.count > 0 ? summary.average.toFixed(1) : "No ratings yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.count > 0
              ? ratingLabel(summary.count)
              : "Be the first to leave stars."}
          </p>
        </div>

        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHoverRating(null)}
          aria-label="Recipe rating"
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const active = displayRating >= value;
            return (
              <button
                key={value}
                type="button"
                disabled={!canRate || pending}
                aria-label={`Rate ${value} ${value === 1 ? "star" : "stars"}`}
                aria-pressed={viewerRating === value}
                onClick={() => chooseRating(value)}
                onMouseEnter={() => canRate && setHoverRating(value)}
                onFocus={() => canRate && setHoverRating(value)}
                onBlur={() => setHoverRating(null)}
                className={cn(
                  "rounded-full p-1.5 text-muted-foreground transition-[color,transform] duration-150 motion-reduce:transition-none",
                  canRate &&
                    "hover:scale-105 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  pending && "cursor-wait",
                  !canRate && "cursor-default",
                )}
              >
                <Star
                  className={cn(
                    "size-6 transition-colors duration-150 motion-reduce:transition-none",
                    active
                      ? "fill-amber-400 text-amber-400"
                      : "fill-transparent text-muted-foreground",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {canRate
          ? viewerRating
            ? `Your rating: ${viewerRating}. Click it again to clear.`
            : "Tap a star to rate this recipe."
          : "Sign in to rate this recipe."}
      </p>
    </section>
  );
}
