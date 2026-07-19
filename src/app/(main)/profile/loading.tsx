import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="container flex max-w-2xl flex-col gap-6 py-8">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-token"
        >
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-9 w-28 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
