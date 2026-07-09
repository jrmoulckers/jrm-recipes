"use client";

import * as React from "react";
import { ChefHat } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type ChecklistItemData = {
  emoji: string;
  title: string;
  detail: string;
  /** Emphasized (grown-up help) item — rendered in the caution token. */
  highlight?: boolean;
};

/**
 * A friendly, tappable "getting ready" item. Ticking is optional delight — the
 * child can proceed without checking anything (the gate is skippable) — but the
 * satisfying check gives young cooks a sense of preparation.
 */
function ChecklistItem({ emoji, title, detail, highlight }: ChecklistItemData) {
  const [done, setDone] = React.useState(false);
  return (
    <li>
      <button
        type="button"
        aria-pressed={done}
        onClick={() => setDone((value) => !value)}
        className={cn(
          "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
          highlight
            ? "border-warning/55 bg-warning/15 text-warning-foreground"
            : "border-border bg-card text-card-foreground",
          done && "border-success/60 bg-success/10",
        )}
      >
        <span aria-hidden="true" className="text-4xl leading-none">
          {emoji}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xl font-bold leading-tight">{title}</span>
          <span className="text-base text-muted-foreground">{detail}</span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "ms-auto flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold",
            done
              ? "border-success bg-success text-success-foreground"
              : "border-muted-foreground/40 text-transparent",
          )}
        >
          ✓
        </span>
      </button>
    </li>
  );
}

/**
 * "Let's get ready!" pre-cook checklist for Kids mode (#444).
 *
 * Shown as the first screen of Cook Mode (before step 1) only when Kids mode is
 * active. Reassures the young cook to wash hands, cook with a grown-up (only
 * when the recipe actually has hot/sharp steps, reusing the hazard detection),
 * and grab their tools. A big primary button proceeds; a subtle skip does too.
 * Whether the gate should show at all + the per-session "don't nag" memory live
 * in the parent so this stays a pure, testable view.
 */
export function PreCookChecklist({
  recipeTitle,
  hasHazards,
  largeTargets,
  onReady,
}: {
  recipeTitle: string;
  hasHazards: boolean;
  largeTargets: boolean;
  onReady: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="text-6xl">
            🧑‍🍳
          </span>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Let&apos;s get ready!
          </h1>
          <p className="text-lg text-muted-foreground">
            A few quick things before we cook {recipeTitle}.
          </p>
        </div>

        <ul className="flex w-full flex-col gap-4">
          <ChecklistItem
            emoji="🧼"
            title="Wash your hands"
            detail="Soap and warm water for 20 seconds — sing your favorite song!"
          />
          {hasHazards && (
            <ChecklistItem
              emoji="🧑‍🍳"
              title="Cook with a grown-up"
              detail="This recipe has hot or sharp steps. Ask a grown-up to help."
              highlight
            />
          )}
          <ChecklistItem
            emoji="🥣"
            title="Grab your tools"
            detail="Get your bowls, spoons, and everything the recipe needs."
          />
        </ul>

        <div className="flex w-full flex-col items-center gap-3">
          <Button
            type="button"
            onClick={onReady}
            size={largeTargets ? "xl" : "lg"}
            className={cn(
              "w-full gap-2 rounded-2xl font-bold",
              largeTargets && "h-[4.5rem] text-xl sm:h-20",
            )}
          >
            <ChefHat aria-hidden="true" />
            I&apos;m ready — let&apos;s cook!
          </Button>
          <button
            type="button"
            onClick={onReady}
            className="rounded-md px-2 py-1 text-base text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Skip for now
          </button>
        </div>
      </main>
    </div>
  );
}
