import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function DietarySettingsLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full" />
      </header>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-token"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-20 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
