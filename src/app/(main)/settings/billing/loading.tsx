import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function BillingSettingsLoading() {
  return (
    <div className="container flex max-w-3xl flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </header>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-token">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-11 w-40" />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-token">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
