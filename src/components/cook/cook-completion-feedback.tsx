"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";

import { setRatingAction } from "~/server/engagement/actions";
import { logCookAction } from "~/server/cooklog/actions";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

/**
 * Post-cook feedback card shown inside the Cook Mode completion moment (#333).
 * The highest-intent time to capture a rating + tasting note is right after the
 * last step, so this bridges Cook Mode back into the social loop without a hunt
 * for the rating UI. It reuses the existing `setRatingAction` + `logCookAction`.
 *
 * Guardrails from the acceptance criteria:
 * - The recipe owner can't rate their own recipe, so the star row is hidden for
 *   them (no self-rating error card) — they can still log the cook.
 * - Everything is optional; leaving it untouched and tapping the outer
 *   "Skip and finish" never blocks leaving Cook Mode.
 * - `reducedMotion` suppresses the celebratory transition.
 */
export function CookCompletionFeedback({
  recipeId,
  recipeSlug,
  canRate,
  isOwner,
  reducedMotion,
}: {
  recipeId: string;
  recipeSlug: string;
  canRate: boolean;
  isOwner: boolean;
  reducedMotion: boolean;
}) {
  const [rating, setRating] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [logCook, setLogCook] = React.useState(true);
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canShowStars = canRate && !isOwner;
  // Nothing actionable to offer a signed-out viewer who also can't log.
  if (!canRate) return null;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const results: string[] = [];

      if (canShowStars && rating > 0) {
        const res = await setRatingAction({
          recipeId,
          recipeSlug,
          value: rating,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        results.push("rating");
      }

      if (logCook) {
        const res = await logCookAction({
          recipeId,
          recipeSlug,
          note,
          photoUrl: "",
          servingsMade: "",
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        results.push("cook");
      }

      setDone(true);
    });
  };

  const nothingToSubmit = (!canShowStars || rating === 0) && !logCook;

  if (done) {
    return (
      <div
        className={cn(
          "mt-6 rounded-2xl border border-success/30 bg-success/10 p-4 text-success",
          !reducedMotion && "motion-safe:animate-fade-in",
        )}
      >
        <p className="flex items-center justify-center gap-2 font-medium">
          <CheckCircle2 className="size-5" aria-hidden />
          Thanks — saved to this recipe.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-left">
      <p className="text-center font-display text-lg font-semibold text-foreground">
        How did it turn out?
      </p>

      {canShowStars ? (
        <div
          className="mt-3 flex items-center justify-center gap-1"
          role="group"
          aria-label="Your star rating"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Rate ${n} ${n === 1 ? "star" : "stars"}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              disabled={pending}
              className={cn(
                "rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !reducedMotion && "transition-transform hover:scale-110",
              )}
            >
              <Star
                className={cn(
                  "size-8",
                  rating >= n
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        <Label htmlFor="cook-tasting-note">Tasting note (optional)</Label>
        <Textarea
          id="cook-tasting-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          placeholder="Kids loved it, halve the salt next time…"
          disabled={pending}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={logCook}
          onChange={(event) => setLogCook(event.target.checked)}
          disabled={pending}
          className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
        Log that I made this
      </label>

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="mt-4 w-full"
        onClick={submit}
        disabled={pending || nothingToSubmit}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
