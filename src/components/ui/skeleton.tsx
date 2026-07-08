import * as React from "react";

import { cn } from "~/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Render the moving shimmer highlight. Defaults to on. The highlight is a
   * translucent band built from the `--foreground` token, so it reads as a
   * gentle sweep in every mode (a soft darkening in light schemes, a soft
   * lightening in dark). Motion collapses to a static block under
   * reduced-motion and Simple mode (see globals.css).
   */
  shimmer?: boolean;
  /**
   * Mark this block as a purely visual placeholder with no loading semantics.
   * Use for the inner blocks of a composed skeleton whose *root* already exposes
   * the status, so a single card doesn't announce "loading" once per block.
   */
  decorative?: boolean;
  /**
   * Accessible loading label announced to assistive tech (ignored when
   * `decorative`). Keeps the "this is loading" state from being purely visual —
   * important because under reduced motion the shimmer is intentionally still.
   */
  label?: string;
}

/**
 * Shared loading semantics: a polite status marked `aria-busy` so non-visual
 * users learn the state even when the shimmer is frozen under reduced motion.
 * The region has no changing text, so it never chatters — it only carries a
 * name and the busy flag.
 */
function loadingSemantics(decorative: boolean, label: string) {
  return decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "status", "aria-busy": true, "aria-label": label } as const);
}

function Skeleton({
  className,
  shimmer = true,
  decorative = false,
  label = "Loading…",
  ...props
}: SkeletonProps) {
  return (
    <div
      {...loadingSemantics(decorative, label)}
      className={cn("relative overflow-hidden rounded-lg bg-muted", className)}
      {...props}
    >
      {shimmer ? (
        <span
          data-skeleton-shimmer=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
        />
      ) : null}
    </div>
  );
}

/**
 * Composed skeletons mirror real component dimensions so swapping in the loaded
 * content causes no layout shift. Keep these in lockstep with their real
 * counterparts (RecipeCard, journal entry row). Each exposes a single loading
 * status on its root and marks its inner blocks decorative.
 */
function RecipeCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading recipe…"
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-token"
    >
      <Skeleton decorative className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton decorative className="h-5 w-3/4" />
        <Skeleton decorative className="h-4 w-full" />
        <Skeleton decorative className="h-4 w-2/3" />
        <div className="flex gap-3 pt-1">
          <Skeleton decorative className="h-3 w-12" />
          <Skeleton decorative className="h-3 w-10" />
          <Skeleton decorative className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

function ListRowSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading…"
      className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-token"
    >
      <Skeleton decorative className="size-20 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <Skeleton decorative className="h-5 w-1/2" />
        <Skeleton decorative className="h-4 w-1/3" />
        <Skeleton decorative className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export { Skeleton, RecipeCardSkeleton, ListRowSkeleton };
