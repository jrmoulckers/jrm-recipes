"use client";

import * as React from "react";

import type { ColorScheme, UITheme } from "~/config/themes";
import { useTheme } from "~/components/theme/theme-provider";
import { cn } from "~/lib/utils";

/**
 * Scheme-aware mode preview (issue #97). Rather than hand-picked hex literals
 * that drift from the real theme (and are light-only), the swatch re-scopes the
 * semantic tokens by setting `data-theme` (and, in dark scheme, `.dark`) on its
 * own wrapper — so the dots below are literally `--primary` / `--secondary` /
 * `--accent` for that mode in the active scheme. One component, zero drift.
 */
const SWATCH_TOKENS = ["bg-primary", "bg-secondary", "bg-accent"] as const;

const SIZES = {
  sm: { dot: "size-5", overlap: "-space-x-1.5" },
  lg: { dot: "size-8", overlap: "-space-x-2" },
} as const;

export interface ThemeSwatchProps extends React.HTMLAttributes<HTMLSpanElement> {
  theme: UITheme;
  /** Force a scheme; defaults to the app's active (resolved) scheme. */
  scheme?: Exclude<ColorScheme, "system">;
  size?: keyof typeof SIZES;
}

export function ThemeSwatch({
  theme,
  scheme,
  size = "sm",
  className,
  ...props
}: ThemeSwatchProps) {
  const { resolvedScheme } = useTheme();
  const effective = scheme ?? resolvedScheme;
  const s = SIZES[size];

  return (
    <span
      data-theme={theme}
      className={cn(
        "flex shrink-0",
        s.overlap,
        effective === "dark" && "dark",
        className,
      )}
      aria-hidden="true"
      {...props}
    >
      {SWATCH_TOKENS.map((token) => (
        <span
          key={token}
          className={cn("rounded-full border-2 border-card", s.dot, token)}
        />
      ))}
    </span>
  );
}
