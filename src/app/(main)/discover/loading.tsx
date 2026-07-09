import * as React from "react";

import { RecipeCardSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function DiscoverLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-10 w-3/4 max-w-xl" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
