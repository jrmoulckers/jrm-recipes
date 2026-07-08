"use client";

import * as React from "react";

import {
  type ColorScheme,
  type UITheme,
} from "~/config/themes";
import { type A11yPrefs } from "~/config/a11y";
import { type ConsentStatus } from "~/config/consent";
import { ThemeProvider } from "~/components/theme/theme-provider";
import { A11yProvider } from "~/components/a11y/a11y-provider";
import { AnalyticsProvider } from "~/components/analytics/analytics-provider";
import { ConsentProvider } from "~/components/analytics/consent-provider";
import { PageviewTracker } from "~/components/analytics/pageview-tracker";
import { ConsentNotice } from "~/components/privacy/consent-notice";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Toaster } from "~/components/ui/sonner";

/** Client-side providers shared across the whole app. */
export function Providers({
  children,
  initialTheme,
  initialScheme,
  initialA11y,
  initialUserId = null,
  initialConsent = "unset",
  requireConsent = false,
}: {
  children: React.ReactNode;
  initialTheme?: UITheme;
  initialScheme?: ColorScheme;
  initialA11y?: A11yPrefs;
  initialUserId?: string | null;
  initialConsent?: ConsentStatus;
  requireConsent?: boolean;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme} initialScheme={initialScheme}>
      <A11yProvider initialPrefs={initialA11y}>
        <ConsentProvider
          initialStatus={initialConsent}
          requireConsent={requireConsent}
        >
          <AnalyticsProvider userId={initialUserId}>
            <PageviewTracker />
            <TooltipProvider delayDuration={200}>
              {children}
              <ConsentNotice />
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </AnalyticsProvider>
        </ConsentProvider>
      </A11yProvider>
    </ThemeProvider>
  );
}
