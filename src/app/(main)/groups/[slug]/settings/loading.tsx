import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function GroupSettingsLoading() {
  return (
    <div className="container max-w-3xl py-10">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-token"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
