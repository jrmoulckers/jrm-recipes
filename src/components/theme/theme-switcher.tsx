"use client";

import * as React from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";

import { COLOR_SCHEMES, UI_THEMES, type ColorScheme, type UITheme } from "~/config/themes";
import { useTheme } from "~/components/theme/theme-provider";
import { ThemeSwatch } from "~/components/theme/theme-swatch";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as UITheme)}
          aria-label="Appearance"
          className="grid gap-1 p-1"
        >
          {UI_THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <DropdownMenuRadioItem
                key={t.id}
                value={t.id}
                onSelect={(event) => event.preventDefault()}
                className={cn(
                  "gap-3 border border-transparent hover:bg-muted",
                  active && "border-border bg-muted",
                )}
              >
                <ThemeSwatch theme={t.id} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {t.label}
                    {active && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {t.description}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Lighting</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={scheme}
          onValueChange={(value) => setScheme(value as ColorScheme)}
          aria-label="Lighting"
          className="flex gap-1 p-1"
        >
          {COLOR_SCHEMES.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              onSelect={(event) => event.preventDefault()}
              className={cn(
                "flex-1 flex-col gap-1 p-2 text-xs font-medium capitalize [&>span:first-child]:hidden",
                "border border-transparent hover:bg-muted",
                scheme === s && "border-border bg-muted text-foreground",
              )}
            >
              {schemeIcon[s]}
              {s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
