"use client";

import { Printer } from "lucide-react";

import { Button } from "~/components/ui/button";

/**
 * Prints the current keepsake page (issue #407). Trivial wrapper around
 * `window.print()` so the surrounding keepsake view can stay a server
 * component; hidden on paper via `print:hidden` at the call site.
 */
export function KeepsakePrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden="true" /> Print this keepsake
    </Button>
  );
}
