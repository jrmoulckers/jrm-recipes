import * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";

/**
 * Group-level fallback for the `(main)` segment. In the App Router a
 * `loading.tsx` here wraps every descendant route's `{children}` in Suspense, so
 * this is the placeholder for the home page *and* any nested route without its
 * own closer `loading.tsx`. It is deliberately layout-neutral — a header band
 * plus a few content blocks inside the shared `container` — so it reads
 * acceptably for any page while route-specific skeletons (recipes, discover,
 * editor, settings, …) override it with a closer-matching shape.
 */
export default function MainLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
