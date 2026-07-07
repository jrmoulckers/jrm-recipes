"use client";

import * as React from "react";

import { ErrorState } from "~/components/layout/error-state";

/**
 * Route-level error boundary. Renders inside the root layout, so it keeps the
 * app theme (data-theme + tokens) while replacing the crashed segment with a
 * friendly, recoverable card.
 */
export default function ErrorBoundary({
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
      description="A hiccup in the kitchen — we couldn't finish loading this page. You can try again, or head back home."
      digest={error.digest}
      onReset={reset}
    />
  );
}
