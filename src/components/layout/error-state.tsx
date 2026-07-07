import * as React from "react";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "~/components/ui/button";

/**
 * Shared, themed "something went wrong" panel used by both the route-level
 * error boundary (`error.tsx`) and the root boundary (`global-error.tsx`).
 *
 * Purely presentational: it never renders the raw error message or stack —
 * only a friendly message plus an optional opaque `digest` reference — so we
 * don't leak internals to the UI.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "A hiccup in the kitchen — we couldn't finish loading this page. You can try again, or head back home.",
  digest,
  onReset,
  className,
}: {
  title?: string;
  description?: string;
  /** Opaque Next.js error digest, safe to surface for support/debugging. */
  digest?: string;
  /** When provided, renders a "Try again" button wired to this callback. */
  onReset?: () => void;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_0%,hsl(var(--destructive)/0.10),transparent),radial-gradient(45%_50%_at_50%_100%,hsl(var(--primary)/0.08),transparent)]"
      />

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
          <TriangleAlert className="size-8" aria-hidden="true" />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="text-pretty text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {onReset && (
            <Button onClick={onReset} size="lg">
              <RotateCcw /> Try again
            </Button>
          )}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate hard navigation: this renders in error boundaries (incl. global-error, where the router context may be gone), so a full reload to a clean home state is safer than client-side routing. */}
          <a
            href="/"
            className={cn(
              buttonVariants({
                variant: onReset ? "outline" : "default",
                size: "lg",
              }),
            )}
          >
            <Home /> Go home
          </a>
        </div>

        {digest && (
          <p className="text-xs text-muted-foreground/70">
            Reference:{" "}
            <code className="font-mono">{digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
