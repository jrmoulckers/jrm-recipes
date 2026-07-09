import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <div className="container flex flex-col gap-10 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <Skeleton className="h-11 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-token"
          >
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-full" />
            <div className="mt-2 flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
            <Skeleton className="mt-auto h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
