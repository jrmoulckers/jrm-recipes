import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

/**
 * Loading placeholder for the recipe editor (create + edit). Mirrors
 * {@link RecipeEditor}'s real layout — `container flex flex-col gap-8 py-8`, a
 * header row with title + actions, and the `minmax(0,1fr)_20rem` main/sidebar
 * grid — so the heavy client editor swaps in with no layout shift. Kept in
 * lockstep with the editor's outer shell; shared by both editor routes so the
 * two `loading.tsx` files stay a single source of truth.
 */
export function RecipeEditorSkeleton() {
  return (
    <div className="container flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="aspect-[16/10] w-full" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </aside>
      </div>
    </div>
  );
}
