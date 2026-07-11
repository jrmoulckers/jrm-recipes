"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, ChefHat, CookingPot, Users, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { ONBOARDING_CHECKLIST_COPY } from "~/config/onboarding-copy";
import type { OnboardingProgress } from "~/server/onboarding/progress";

/** localStorage flag, mirroring the welcome-card dismissal pattern (#78). */
export const ONBOARDING_CHECKLIST_DISMISS_KEY =
  "heirloom:onboarding-checklist-dismissed";

/** Whether the checklist has already been dismissed on this device. */
export function onboardingChecklistDismissed(): boolean {
  try {
    return (
      window.localStorage.getItem(ONBOARDING_CHECKLIST_DISMISS_KEY) === "1"
    );
  } catch {
    return false;
  }
}

const STEP_ICONS = [ChefHat, CookingPot, Users] as const;
const STEP_HREFS: readonly Route[] = ["/recipes/new", "/recipes", "/groups"];

/**
 * First-run onboarding checklist for the home dashboard (#78). It guides brand
 * new users through Heirloom's core loop — create → cook → share — and marks
 * each step done from the viewer's *real* data (see `OnboardingProgress`), not a
 * separate bag of flags. It's dismissible (persisted in `localStorage`, like the
 * install prompt) and retires itself automatically once every step is complete,
 * so it never nags an established user. Copy lives in `~/config/onboarding-copy`
 * for later localization / mode-adaptation, and every color is token-driven so
 * it reads correctly across all five UI modes in light and dark.
 */
export function OnboardingChecklist({
  progress,
}: {
  progress: OnboardingProgress;
}) {
  // Start hidden and reveal after mount so the persisted-dismissal check runs
  // client-side only (no SSR/CSR flash of a card the user already dismissed).
  // `mounted` keeps the card in the DOM; `entered` drives a gentle fade/rise on
  // arrival and a fade-out on dismiss, so it eases in and out instead of a hard
  // pop-in / snap-out — matching the install-prompt's transition pattern.
  const [mounted, setMounted] = React.useState(false);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (onboardingChecklistDismissed()) return;
    setMounted(true);
    // Flip to the entered state on the next frame so the transition animates.
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = React.useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_CHECKLIST_DISMISS_KEY, "1");
    } catch {
      // Storage unavailable (private mode) — just hide for this session.
    }
    // Play the exit transition first, then unmount once it has settled.
    setEntered(false);
    window.setTimeout(() => setMounted(false), 200);
  }, []);

  const completion = [
    progress.hasRecipe,
    progress.hasCooked,
    progress.hasShared,
  ];
  const doneCount = completion.filter(Boolean).length;
  const total = completion.length;

  // Retire once the user has finished the whole loop — nothing left to guide.
  if (doneCount === total) return null;
  if (!mounted) return null;

  const pct = Math.round((doneCount / total) * 100);
  // The first not-yet-done step gets the emphasized primary CTA.
  const nextStep = completion.findIndex((done) => !done);

  return (
    <section
      aria-labelledby="onboarding-checklist-heading"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-token-sm sm:p-6",
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
        aria-label={ONBOARDING_CHECKLIST_COPY.dismiss}
        className="absolute end-3 top-3 size-9 text-muted-foreground"
      >
        <X className="size-4" />
      </Button>

      <div className="max-w-xl pe-8">
        <h2
          id="onboarding-checklist-heading"
          className="font-display text-xl font-bold tracking-tight"
        >
          {ONBOARDING_CHECKLIST_COPY.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ONBOARDING_CHECKLIST_COPY.subheading}
        </p>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${doneCount} of ${total} steps complete`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-standard"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className="text-xs font-medium tabular-nums text-muted-foreground"
          aria-hidden="true"
        >
          {doneCount}/{total}
        </span>
      </div>

      <ol className="mt-6 flex flex-col gap-2">
        {ONBOARDING_CHECKLIST_COPY.steps.map((step, i) => {
          const done = completion[i] ?? false;
          const Icon = STEP_ICONS[i] ?? ChefHat;
          const href = STEP_HREFS[i] ?? "/recipes/new";
          const isNext = i === nextStep;
          return (
            <li
              key={step.title}
              className={cn(
                "flex flex-col gap-3 rounded-xl p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                // Only the recommended next step is lifted — a subtle tint plus
                // an inset ring — so the card reads as one surface, not a stack
                // of nested cards.
                isNext && "bg-primary/5 ring-1 ring-inset ring-primary/15",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                    done
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/12 text-primary",
                  )}
                >
                  {done ? (
                    <Check className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <div>
                  <p
                    className={cn(
                      "font-semibold",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {step.title}
                  </p>
                  {!done && (
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  )}
                </div>
              </div>
              {done ? (
                <span className="ms-11 text-xs font-medium text-primary sm:ms-0">
                  Done
                </span>
              ) : (
                <Button
                  asChild
                  size="sm"
                  variant={isNext ? "default" : "outline"}
                  className="ms-11 self-start sm:ms-0 sm:self-auto"
                >
                  <Link href={href}>{step.cta}</Link>
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
