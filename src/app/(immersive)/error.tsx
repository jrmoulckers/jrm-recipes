"use client";

import * as React from "react";

import { ErrorState } from "~/components/layout/error-state";

/**
 * Segment-level error boundary for the `(immersive)` route group (cook/print
 * surfaces). The immersive layout drops the site chrome and renders no `<main>`,
 * so the boundary keeps the default `main` landmark for the recovered view.
 */
export default function ImmersiveSegmentError({
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
      description="A hiccup in the kitchen — we couldn't finish loading this view. You can try again, or head back home."
      digest={error.digest}
      onReset={reset}
    />
  );
}
