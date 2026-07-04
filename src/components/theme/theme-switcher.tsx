"use client";

import * as React from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";

import { COLOR_SCHEMES, UI_THEMES, type ColorScheme } from "~/config/themes";
import { useTheme } from "~/components/theme/theme-provider";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const schemeIcon: Record<ColorScheme, React.ReactNode> = {
  light: <Sun className="size-4" />,
  dark: <Moon className="size-4" />,
  system: <Monitor className="size-4" />,
};

/** Quick light/dark toggle for tight spaces. */
export function SchemeToggle({ className }: { className?: string }) {
  const { resolvedScheme, toggleScheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleScheme}
      aria-label={`Switch to ${resolvedScheme === "dark" ? "light" : "dark"} mode`}
      className={className}
    >
      <Sun className="size-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

/** Full theme picker: five UI modes + light/dark/system. */
export function ThemeSwitcher() {
  const { theme, scheme, setTheme, setScheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Change appearance">
          <Palette className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <div className="grid gap-1 p-1">
          {UI_THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:bg-muted",
                  active && "border-border bg-muted",
                )}
              >
                <span className="flex shrink-0 -space-x-1.5">
                  {t.swatch.map((c, i) => (
                    <span
                      key={i}
                      className="size-5 rounded-full border-2 border-card"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {t.label}
                    {active && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {t.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Lighting</DropdownMenuLabel>
        <div className="flex gap-1 p-1">
          {COLOR_SCHEMES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScheme(s)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg border border-transparent p-2 text-xs font-medium capitalize transition-colors hover:bg-muted",
                scheme === s && "border-border bg-muted text-foreground",
              )}
            >
              {schemeIcon[s]}
              {s}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
