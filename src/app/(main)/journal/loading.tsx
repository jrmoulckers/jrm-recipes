import * as React from "react";

import { ListRowSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function JournalLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
