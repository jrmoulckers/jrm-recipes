"use client";

import * as React from "react";
import { Star } from "lucide-react";

import {
  removeRatingAction,
  setRatingAction,
} from "~/server/engagement/actions";
import { cn } from "~/lib/utils";
import { useReducedMotion } from "~/lib/use-reduced-motion";
import { useServerAction } from "~/lib/use-server-action";

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
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);
  const [viewerRating, setViewerRating] = React.useState(props.viewerRating);
  const [summary, setSummary] = React.useState(props.summary);
  const reducedMotion = useReducedMotion();
  // The just-committed value (plus a retrigger key) that drives the staggered
  // fill. Null except immediately after a rating is set, so hover, mount, and
  // clearing never animate.
  const [commit, setCommit] = React.useState<{ value: number; key: number } | null>(
    null,
  );
  // Snapshot of pre-click state so a failed submit can roll the stars back.
  const rollbackRef = React.useRef<{
    rating: number | null;
    summary: RatingSummary;
  }>({ rating: props.viewerRating, summary: props.summary });
  const submitRating = useServerAction(
    (input: { recipeId: string; recipeSlug: string; value: number | null }) =>
      input.value == null
        ? removeRatingAction({
            recipeId: input.recipeId,
            recipeSlug: input.recipeSlug,
          })
        : setRatingAction({
            recipeId: input.recipeId,
            recipeSlug: input.recipeSlug,
            value: input.value,
          }),
    {
      successToast: (_result, input) =>
        input.value == null ? "Rating cleared." : "Rating saved.",
      errorToast: true,
      refresh: true,
      onError: () => {
        setViewerRating(rollbackRef.current.rating);
        setSummary(rollbackRef.current.summary);
      },
    },
  );
  const pending = submitRating.pending;

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
    rollbackRef.current = { rating: viewerRating, summary };
    const nextSummary = updateSummary(summary, viewerRating, nextRating);

    setViewerRating(nextRating);
    setSummary(nextSummary);
    setHoverRating(nextRating);
    // Punctuate a *set* (not a clear) with a left-to-right staggered pop.
    if (nextRating != null && !reducedMotion) {
      setCommit((current) => ({ value: nextRating, key: (current?.key ?? 0) + 1 }));
    } else {
      setCommit(null);
    }

    submitRating.run({ recipeId, recipeSlug, value: nextRating });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-token">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status" aria-live="polite">
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
          role="group"
          aria-label="Recipe rating"
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const active = displayRating >= value;
            const popping = commit != null && value <= commit.value;
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
                  "rounded-full p-1.5 text-muted-foreground transition-[color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                  canRate && "hover:scale-105 hover:text-amber-400",
                  pending && "cursor-wait",
                  !canRate && "cursor-default",
                )}
              >
                <Star
                  key={popping ? `pop-${commit.key}-${value}` : `star-${value}`}
                  style={
                    popping
                      ? { animationDelay: `${(value - 1) * 60}ms` }
                      : undefined
                  }
                  className={cn(
                    "size-6 transition-colors duration-150 motion-reduce:transition-none",
                    popping && "motion-safe:animate-star-pop",
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