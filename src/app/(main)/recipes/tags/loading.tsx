import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function RecipesTagsLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 18 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
    </div>
  );
}
