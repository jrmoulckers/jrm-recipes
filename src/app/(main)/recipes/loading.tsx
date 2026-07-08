import * as React from "react";

import { RecipeCardSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function RecipesLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-12 w-40" />
      </div>

      <Skeleton className="h-12 w-full rounded-xl" />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
