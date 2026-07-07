"use client";

import * as React from "react";

// global-error replaces the ROOT layout, so the app's global stylesheet is not
// otherwise applied here — import it directly so design tokens + base styles
// are available for the themed fallback below.
import "~/styles/globals.css";
import { DEFAULT_UI_THEME } from "~/config/themes";
import { ErrorState } from "~/components/layout/error-state";

/**
 * Root error boundary. This renders when the root layout itself throws, which
 * means it must provide its own <html> and <body>. We pin the default UI theme
 * so the tokens resolve to a sensible palette even without the theme cookie.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme={DEFAULT_UI_THEME}>
      <body className="min-h-dvh bg-background font-body text-foreground antialiased">
        <ErrorState
          description="The app ran into an unexpected problem. Try again, or return home to get cooking."
          digest={error.digest}
          onReset={reset}
        />
      </body>
    </html>
  );
}
