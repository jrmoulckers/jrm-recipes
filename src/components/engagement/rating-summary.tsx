import { Star, Users } from "lucide-react";

import type { RatingBreakdownResult } from "~/server/engagement/queries";
import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

function initialsOf(name: string | null, handle: string | null): string {
  const source = (name ?? handle ?? "?").trim();
  return source.slice(0, 1).toUpperCase();
}

/**
 * Per-family rating breakdown (issue #334): average + count, a 5→1 star
 * distribution, and a capped stack of the members who rated. Purely presentational
 * — the aggregation and visibility gating happen in `getRatingBreakdown`. Shown
 * beside the rating control so a viewer sees not just the number but who loved it.
 */
export function RatingSummary({
  breakdown,
}: {
  breakdown: RatingBreakdownResult;
}) {
  const { average, count, distribution, raters, totalRaters } = breakdown;

  if (count === 0) {
    return (
      <section
        aria-label="Rating breakdown"
        className="rounded-2xl border border-border bg-card p-4 shadow-token sm:p-5"
      >
        <p className="text-sm text-muted-foreground">
          No ratings yet — be the first to rate this recipe.
        </p>
      </section>
    );
  }

  const max = Math.max(1, ...distribution.map((row) => row.count));
  const overflow = totalRaters - raters.length;

  return (
    <section
      aria-label="Rating breakdown"
      className="rounded-2xl border border-border bg-card p-4 shadow-token sm:p-5"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center gap-1 sm:pe-5">
          <span className="font-display text-4xl font-semibold text-foreground">
            {average.toFixed(1)}
          </span>
          <span
            className="flex items-center gap-0.5"
            aria-label={`Average ${average.toFixed(1)} out of 5 stars`}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn(
                  "size-4",
                  average >= n - 0.25
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-muted-foreground",
                )}
                aria-hidden
              />
            ))}
          </span>
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? "rating" : "ratings"}
          </span>
        </div>

        <ul className="flex flex-1 flex-col gap-1.5">
          {distribution.map((row) => {
            const pct = count > 0 ? Math.round((row.count / count) * 100) : 0;
            const width = max > 0 ? (row.count / max) * 100 : 0;
            return (
              <li key={row.star} className="flex items-center gap-2 text-sm">
                <span className="flex w-10 shrink-0 items-center gap-0.5 text-muted-foreground">
                  {row.star}
                  <Star
                    className="size-3 fill-amber-400 text-amber-400"
                    aria-hidden
                  />
                </span>
                <span
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${row.star} stars: ${row.count} ${
                    row.count === 1 ? "rating" : "ratings"
                  } (${pct}%)`}
                >
                  <span
                    className="block h-full rounded-full bg-amber-400"
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-end tabular-nums text-muted-foreground">
                  {row.count}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {raters.length > 0 ? (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <div className="flex -space-x-2">
            {raters.map((rater) => {
              const name = rater.name ?? rater.handle ?? "Member";
              return (
                <Avatar
                  key={rater.id}
                  className="size-7 ring-2 ring-card"
                  title={name}
                >
                  {rater.avatarUrl ? (
                    <AvatarImage src={rater.avatarUrl} alt={name} />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {initialsOf(rater.name, rater.handle)}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          {overflow > 0 ? (
            <span className="text-xs text-muted-foreground">
              +{overflow} more
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
