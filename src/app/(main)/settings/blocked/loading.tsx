import * as React from "react";

import { ListRowSkeleton, Skeleton } from "~/components/ui/skeleton";

export default function BlockedSettingsLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full" />
      </header>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
