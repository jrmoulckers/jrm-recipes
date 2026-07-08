import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function ShoppingLoading() {
  return (
    <div className="container flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-52 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-token"
          >
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="ms-auto h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
