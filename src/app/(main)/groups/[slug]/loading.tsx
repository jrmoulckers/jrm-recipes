import * as React from "react";

import { ListRowSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function GroupDetailLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <Skeleton className="h-4 w-28" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
