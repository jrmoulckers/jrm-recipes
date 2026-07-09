import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

export default function NotificationSettingsLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full" />
      </header>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-token"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
