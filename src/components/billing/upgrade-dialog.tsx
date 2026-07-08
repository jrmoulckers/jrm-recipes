"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { getPlan, type FeatureFlagKey } from "~/config/plans";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

/**
 * Upgrade prompt dialog (issue #311).
 *
 * Explains, in plain and respectful language, that a premium feature belongs to
 * the Family plan and offers a single route to `/pricing`. Deliberately free of
 * dark patterns: it is fully dismissible (a "Not now" button, the ✕, Escape, and
 * an overlay click all close it), never blocks content the user already made,
 * and carries no countdowns, scarcity, or guilt copy. Plan name, tagline, and
 * benefits all come from `src/config/plans.ts` — nothing here hard-codes a price.
 */

const FAMILY = getPlan("family");

/** Reader-friendly names for each premium feature, used only for dialog copy. */
const FEATURE_LABELS: Record<FeatureFlagKey, string> = {
  aiGeneration: "AI recipe generation",
  aiTutor: "the AI cooking tutor",
  aiSubstitutions: "AI ingredient substitutions",
  videoExport: "video & reel exports",
  advancedCollaboration: "advanced family collaboration",
};

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type UpgradeDialogProps = {
  /** The gated feature, used to tailor the explanatory copy. */
  feature?: FeatureFlagKey;
  /** Controlled open state (omit for trigger-driven usage). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional element that opens the dialog (rendered via `DialogTrigger`). */
  trigger?: React.ReactNode;
  /** Override the default heading / body copy. */
  title?: string;
  description?: string;
};

export function UpgradeDialog({
  feature,
  open,
  onOpenChange,
  trigger,
  title,
  description,
}: UpgradeDialogProps) {
  const featureLabel = feature ? FEATURE_LABELS[feature] : "This feature";
  const heading = title ?? `Unlock ${FAMILY.name}`;
  const body =
    description ??
    `${sentenceCase(featureLabel)} is part of ${FAMILY.name}. ${FAMILY.tagline}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            {heading}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {FAMILY.highlights.slice(0, 4).map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <Check
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Not now</Button>
          </DialogClose>
          <Button asChild>
            <Link href="/pricing">See plans</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Imperative helper for locked actions (issue #311). Returns a ready-to-render
 * `dialog` node plus `promptUpgrade()` to open it — e.g. call it from a locked
 * button's `onClick`. The prompt is always dismissible and never auto-opens.
 *
 * ```tsx
 * const { dialog, promptUpgrade } = useUpgradePrompt("aiGeneration");
 * return <><Button onClick={promptUpgrade}>Generate…</Button>{dialog}</>;
 * ```
 */
export function useUpgradePrompt(feature?: FeatureFlagKey) {
  const [open, setOpen] = React.useState(false);
  const dialog = (
    <UpgradeDialog feature={feature} open={open} onOpenChange={setOpen} />
  );
  return {
    open,
    setOpen,
    promptUpgrade: React.useCallback(() => setOpen(true), []),
    dialog,
  };
}
