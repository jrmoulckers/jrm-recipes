import * as React from "react";

import { RecipeCardSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function CollectionDetailLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <Skeleton className="h-4 w-32" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
