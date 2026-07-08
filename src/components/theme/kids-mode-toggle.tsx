"use client";

import * as React from "react";
import { Blocks } from "lucide-react";

import { useTheme } from "~/components/theme/theme-provider";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * Always-visible, one-tap Kids mode toggle for the site header (#435).
 *
 * Reuses the theme provider's `setKidsMode` — the exact same logic the
 * Accessibility dialog toggle calls — so the two stay in perfect sync and honor
 * the "restore the previous theme when switched off" behavior instead of
 * hardcoding a theme. The filled/active state makes the current mode obvious at
 * a glance without opening any dialog.
 */
export function KidsModeToggle({ className }: { className?: string }) {
  const { theme, setKidsMode } = useTheme();
  const kidsOn = theme === "kids";

  return (
    <Button
      type="button"
      variant={kidsOn ? "default" : "outline"}
      size="icon"
      aria-pressed={kidsOn}
      aria-label={kidsOn ? "Turn off Kids mode" : "Turn on Kids mode"}
      title={kidsOn ? "Kids mode is on" : "Kids mode"}
      onClick={() => setKidsMode(!kidsOn)}
      className={className}
    >
      <Blocks className={cn("size-5", kidsOn && "fill-current")} />
    </Button>
  );
}
