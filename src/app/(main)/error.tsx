"use client";

import * as React from "react";

import { ErrorState } from "~/components/layout/error-state";

/**
 * Segment-level error boundary for the `(main)` route group. It renders inside
 * the group layout, so the site header, footer, and nav stay intact while only
 * the crashed page content is replaced with the recoverable card. Uses `as="div"`
 * because the layout already provides the page's `<main>` landmark.
 */
export default function MainSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log for diagnostics without ever surfacing the message/stack in the UI.
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      as="div"
      className="min-h-[60vh]"
      description="A hiccup in the kitchen — we couldn't finish loading this section. You can try again, or head back home."
      digest={error.digest}
      onReset={reset}
    />
  );
}
