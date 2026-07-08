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
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
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
 * counterparts (RecipeCard, journal entry row).
 */
function RecipeCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-token">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

function ListRowSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-token">
      <Skeleton className="size-20 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export { Skeleton, RecipeCardSkeleton, ListRowSkeleton };
