import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function RedeemLoading() {
  return (
    <div className="container flex max-w-lg flex-col gap-8 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <Skeleton className="size-14 rounded-2xl" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-token">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
