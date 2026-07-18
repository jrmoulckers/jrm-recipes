import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function RecipeDetailLoading() {
  return (
    <div className="pb-16">
      {/* Hero */}
      <Skeleton className="aspect-[21/9] max-h-72 w-full rounded-none" />

      <div className="container -mt-16 flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-12 w-3/4 max-w-2xl" />
          <Skeleton className="h-6 w-full max-w-xl" />

          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-28" />
            ))}
          </div>
        </div>

        <Skeleton className="h-px w-full" />

        {/* Tabs (recipe / timeline / cooked / discussion) — matches the real
            page's TabsList so the grid below doesn't shift down on hydration. */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28" />
            ))}
          </div>

          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            {/* Ingredients */}
            <div className="flex flex-col gap-4">
              <Skeleton className="h-7 w-40" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>

            {/* Method */}
            <div className="flex flex-col gap-6">
              <Skeleton className="h-7 w-32" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2 pt-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
