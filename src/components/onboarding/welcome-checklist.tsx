"use client";

import * as React from "react";
import Link from "next/link";
import { ChefHat, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { WELCOME_COPY } from "~/config/onboarding-copy";

/** localStorage flag, mirroring the install-prompt dismissal pattern. */
export const WELCOME_DISMISS_KEY = "heirloom:welcome-dismissed";

/** Whether the first-run welcome has already been dismissed on this device. */
export function welcomeDismissed(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-run welcome moment (issue #147). A dismissible, copy-led card that
 * orients a brand-new, empty account to Heirloom's core loop — create → cook →
 * share — as three friendly steps. Rendered above the empty-library state, so
 * it only appears when the library has zero recipes; dismissal persists in
 * `localStorage` so it never nags on later visits. All strings live in
 * `~/config/onboarding-copy` for later localization / mode-adaptation.
 */
export function WelcomeChecklist() {
  // Start hidden and reveal after mount so the persisted-dismissal check runs
  // client-side only (no SSR/CSR flash of a card the user already dismissed).
  // `mounted` keeps the card in the DOM; `entered` drives a gentle fade/rise on
  // arrival and a fade-out on dismiss, so it eases in and out instead of a hard
  // pop-in / snap-out (mirrors OnboardingChecklist + the install-prompt).
  const [mounted, setMounted] = React.useState(false);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (welcomeDismissed()) return;
    setMounted(true);
    // Flip to the entered state on the next frame so the transition animates.
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = React.useCallback(() => {
    try {
      window.localStorage.setItem(WELCOME_DISMISS_KEY, "1");
    } catch {
      // Storage unavailable (private mode) — just hide for this session.
    }
    // Play the exit transition first, then unmount once it has settled.
    setEntered(false);
    window.setTimeout(() => setMounted(false), 200);
  }, []);

  if (!mounted) return null;

  return (
    <section
      aria-labelledby="welcome-checklist-heading"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-token-sm sm:p-8",
        "transition-all duration-base ease-standard motion-reduce:transition-none",
        entered
          ? "translate-y-0 opacity-100"
          : "-translate-y-1 opacity-0 motion-reduce:translate-y-0",
      )}
    >
      <Button
        size="icon"
        variant="ghost"
        onClick={dismiss}
        aria-label={WELCOME_COPY.dismiss}
        className="absolute end-3 top-3 size-9 text-muted-foreground"
      >
        <X className="size-4" />
      </Button>

      <div className="max-w-xl">
        <h2
          id="welcome-checklist-heading"
          className="font-display text-2xl font-bold tracking-tight"
        >
          {WELCOME_COPY.heading}
        </h2>
        <p className="mt-1 text-muted-foreground">{WELCOME_COPY.subheading}</p>
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {WELCOME_COPY.steps.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-2">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full",
                "bg-primary/12 font-semibold text-primary",
              )}
            >
              {i + 1}
            </span>
            <span className="font-semibold">{step.title}</span>
            <span className="text-sm text-muted-foreground">{step.body}</span>
            {i === 0 && (
              <Button asChild size="sm" className="mt-1 self-start">
                <Link href="/recipes/new">
                  <ChefHat /> {WELCOME_COPY.cta}
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
