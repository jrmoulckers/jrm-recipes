"use client";

import * as React from "react";
import { Blocks } from "lucide-react";

import { useKidsMode } from "~/components/theme/use-kids-mode";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * Always-visible, one-tap Kids mode toggle for the site header (#435).
 *
 * Reuses the shared {@link useKidsMode} bridge — the exact same logic the
 * Accessibility dialog toggle calls — so the two stay in perfect sync. It flips
 * the UI theme (restoring the previous mode when switched off) and couples the
 * a11y comfort defaults (#445). The filled/active state makes the current mode
 * obvious at a glance without opening any dialog.
 */
export function KidsModeToggle({
  className,
  label,
}: {
  className?: string;
  /**
   * When set, render a full-width, left-aligned labeled row (icon + text) for
   * the mobile overflow menu instead of the icon-only header button. The
   * on/off state stays conveyed through `aria-pressed` and the filled icon.
   */
  label?: string;
}) {
  const { kidsOn, setKidsMode } = useKidsMode();

  return (
    <Button
      type="button"
      variant={kidsOn ? "default" : label ? "ghost" : "outline"}
      size={label ? "default" : "icon"}
      aria-pressed={kidsOn}
      aria-label={label ? undefined : kidsOn ? "Turn off Kids mode" : "Turn on Kids mode"}
      title={kidsOn ? "Kids mode is on" : "Kids mode"}
      onClick={() => setKidsMode(!kidsOn)}
      className={cn(
        label && "h-11 w-full justify-start gap-3 px-2 font-medium",
        className,
      )}
    >
      <Blocks className={cn("size-5", kidsOn && "fill-current")} />
      {label}
    </Button>
  );
}
