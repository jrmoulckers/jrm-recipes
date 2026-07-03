"use client";

import * as React from "react";

import {
  type ColorScheme,
  type UITheme,
} from "~/config/themes";
import { ThemeProvider } from "~/components/theme/theme-provider";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Toaster } from "~/components/ui/sonner";

/** Client-side providers shared across the whole app. */
export function Providers({
  children,
  initialTheme,
  initialScheme,
}: {
  children: React.ReactNode;
  initialTheme?: UITheme;
  initialScheme?: ColorScheme;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme} initialScheme={initialScheme}>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
