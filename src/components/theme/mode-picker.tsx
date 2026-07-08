"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { UI_THEMES } from "~/config/themes";
import { useTheme } from "~/components/theme/theme-provider";
import { ThemeSwatch } from "~/components/theme/theme-swatch";
import { cn } from "~/lib/utils";

/**
 * Landing-page "try it live" mode picker. Applies each UI mode instantly so
 * visitors feel the theming system before signing up.
 */
export function ModePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {UI_THEMES.map((t) => {
        const active = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-pressed={active}
            className={cn(
              "group relative flex flex-col gap-3 rounded-xl border-2 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-token-lg",
              active ? "border-primary shadow-token" : "border-border",
            )}
          >
            <ThemeSwatch theme={t.id} size="lg" />
            <span>
              <span className="flex items-center gap-1.5 font-display text-base font-semibold">
                {t.label}
                {active && <Check className="size-4 text-primary" />}
              </span>
              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {t.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
