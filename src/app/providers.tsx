"use client";

import * as React from "react";

import {
  type ColorScheme,
  type UITheme,
} from "~/config/themes";
import { type A11yPrefs } from "~/config/a11y";
import { ThemeProvider } from "~/components/theme/theme-provider";
import { A11yProvider } from "~/components/a11y/a11y-provider";
import { AnalyticsProvider } from "~/components/analytics/analytics-provider";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Toaster } from "~/components/ui/sonner";

/** Client-side providers shared across the whole app. */
export function Providers({
  children,
  initialTheme,
  initialScheme,
  initialA11y,
}: {
  children: React.ReactNode;
  initialTheme?: UITheme;
  initialScheme?: ColorScheme;
  initialA11y?: A11yPrefs;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme} initialScheme={initialScheme}>
      <A11yProvider initialPrefs={initialA11y}>
        <AnalyticsProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </AnalyticsProvider>
      </A11yProvider>
    </ThemeProvider>
  );
}
