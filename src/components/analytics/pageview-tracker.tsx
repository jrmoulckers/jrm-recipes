"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { track } from "~/lib/analytics";
import { normalizePathname } from "~/lib/analytics/pageview";

/**
 * Emits a `$pageview` on initial load and on every App Router client navigation.
 *
 * App Router client navigations don't trigger the SDK's autocapture pageview
 * (which is disabled anyway to avoid double counts), so we drive them manually
 * from `usePathname`/`useSearchParams`. Paths are normalized to placeholders and
 * the query string is dropped, so no recipe/group id or slug leaks into the URL.
 */
function PageviewTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Track query changes without emitting their (potentially sensitive) values.
  const query = searchParams?.toString() ?? "";

  React.useEffect(() => {
    if (!pathname) return;
    const normalized = normalizePathname(pathname);
    const origin =
      typeof window === "undefined" ? "" : window.location.origin;
    track("$pageview", {
      pathname: normalized,
      $current_url: `${origin}${normalized}`,
    });
  }, [pathname, query]);

  return null;
}

/**
 * `useSearchParams` opts a subtree into client rendering and must sit under a
 * Suspense boundary, or the whole route is forced dynamic and `pnpm build`
 * warns. Wrapping here keeps that requirement self-contained.
 */
export function PageviewTracker() {
  return (
    <React.Suspense fallback={null}>
      <PageviewTrackerInner />
    </React.Suspense>
  );
}
