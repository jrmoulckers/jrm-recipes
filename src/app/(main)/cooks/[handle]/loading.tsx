import * as React from "react";

import { RecipeCardSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function CookProfileLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </section>
    </div>
  );
}
